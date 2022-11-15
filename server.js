const puppeteer = require('puppeteer');
const express = require('express')
const request = require('request');
var queue = require('express-queue');

const bodyParser = require('body-parser');

const getBrowser = () => puppeteer.launch({ 
    autoSelectChrome: true,
    chromeFlags: [
      '--disable-gpu',
      '--no-sandbox',
    ],
    logLevel: 'verbose',
    args: [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        //'--crash-test', // Causes the browser process to crash on startup, useful to see if we catch that correctly
        // not idea if those 2 aa options are usefull with disable gl thingy
        '--disable-canvas-aa', // Disable antialiasing on 2d canvas
        '--disable-2d-canvas-clip-aa', // Disable antialiasing on 2d canvas clips
        '--disable-gl-drawing-for-tests', // BEST OPTION EVER! Disables GL drawing operations which produce pixel output. With this the GL output will not be correct but tests will run faster.
        '--disable-dev-shm-usage', // ???
        '--no-zygote', // wtf does that mean ?
        '--use-gl=swiftshader', // better cpu usage with --use-gl=desktop rather than --use-gl=swiftshader, still needs more testing.
        '--enable-webgl',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-first-run',
        '--disable-infobars',
        '--disable-breakpad',
        //'--ignore-gpu-blacklist',
        '--window-size=800,600', // see defaultViewport
        '--user-data-dir=./chromeData', // created in index.js, guess cache folder ends up inside too.
        //'--no-sandbox', // meh but better resource comsuption
        '--disable-setuid-sandbox',
        '--disable-features=site-per-process',
    ],
    headless: true, // process.env['DISPLAY'] = ':0'; in index.js, xorg running.
    ignoreDefaultArgs: true, // needed ?
    devtools: false, // not needed so far, we can see websocket frames and xhr responses without that.
});

const SELECTORS = {
  NAME: '.qBF1Pd.fontHeadlineSmall',
  PHONE: '.Io6YTe',
  LISTING: 'a[href^="https://www.google.com/maps/place/',
  RATINGS: '.ZkP5Je',
  PRICE: '.wcldff.fontHeadlineSmall.Cbys4b',
  LINK: '.hfpxzc',
  IMAGE: '.FQ2IWe.p0Hhde',
  SCROLL: ".m6QErb[aria-label]",
}

const app = express();
const queueMw = queue({ activeLimit: 2, queuedLimit: -1 });
app.use( bodyParser.json());
// app.use(queue({ activeLimit: 2, queuedLimit: -1 }));
app.use(queueMw);

//CORS express
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const getData = async (page, currentPageNum) => {

    return await page.evaluate((opts) => {
        const { selectors: SELECTORS } = opts;

        const elements = document.querySelectorAll(SELECTORS.LISTING);
        const placesElements = Array.from(elements).map(element => element.parentElement);

        const places = placesElements.map((place, index) => {
            const name = (place.querySelector(SELECTORS.NAME)?.textContent || '').trim();
            const rating = (place.querySelector(SELECTORS.RATINGS)?.textContent || '').trim();
            const price = (place.querySelector(SELECTORS.PRICE)?.textContent || '').trim();
            const link = (place.querySelector(SELECTORS.LINK)?.href || '');
            const image = (place.querySelector(SELECTORS.IMAGE)?.children[0].src || '');

            return { name, rating, price, link, image };
        })

        return places;
    }, { selectors: SELECTORS, currentPageNum });
}

const scroling = async (page, scrollContainer, time, limit) => {
    
    let lastHeight = await page.evaluate(`document.querySelector("${scrollContainer}").scrollHeight`);
    console.log(lastHeight)

    while (true) {
        await page.evaluate(`document.querySelector("${scrollContainer}").scrollTo(0, document.querySelector("${scrollContainer}").scrollHeight)`);
        //await page.waitForTimeout(time);
        let newHeight = limit ?? await page.evaluate(`document.querySelector("${scrollContainer}").scrollHeight`);
        if (newHeight === lastHeight) {
            break;
        }
        console.log(newHeight)
        lastHeight = newHeight;
    }
}

// (async () => {
async function start(query, webhook, time){

  let browser = null;

  try {

    browser = await getBrowser();
    const page = await browser.newPage();
    
    page.setDefaultNavigationTimeout(0)

    // Visit maps.google.com
    await page.goto('https://maps.google.com')

    // Wait till the page loads and an input field with id searchboxinput is present
    await page.waitForSelector('#searchboxinput')
    // Simulate user click
    await page.click('#searchboxinput')

    // Type our search query
    await page.type('#searchboxinput', query);
    // Simulate pressing Enter key
    await page.keyboard.press('Enter');

    // Wait for the page to load results.
    await page.waitForSelector(SELECTORS.LISTING);

    // Get our final structured data
    await scroling(page, SELECTORS.SCROLL, 1000, time);

    const finalData = await getData(page, 2);
    
    await parseData(browser, webhook, finalData);

  } catch (error) {
    console.log(error)
  }

}

async function parseData(browser, webhook, finalData){

    try {

        finalData.forEach(async (place) => {

            const page = await browser.newPage();
            await page.setDefaultNavigationTimeout(0);
            await page.goto(place.link);
         
            let dados = {
                "name": place.name,
                "rating": place.rating,
                "infos": []
            }
            // "price": place.price,
            // "link": place.link,
            // "image": place.image,
    
            const infos = await page.$$('.Io6YTe');
            for (const info of infos)

                dados.infos.push(await page.evaluate(info => info.textContent, info));

                request.post({
                    headers: { 'Content-type' : 'application/json' },
                    url: webhook,
                    body: JSON.stringify(dados)
                  }, function(error, response, body){
                    
                    console.log('Error webhook:', error === null ? "Not" : "Yes");
                    
                });
            
                await page.close();

        });
        
        return dados;
        
    } catch (error) {
        return error;
    }
}

function middleware (callback) {
    return function (req, res, next) {
      callback(req, res, next)
        .catch(next)
    }
}

app.post('/find', middleware( async(req, res) => {

    const query = req.body.query;
    const webhook = req.body.webhook;
    const times = req.body.time;

    console.log(`queueLength: ${queueMw.queue.getLength()}`);

    await start(query, webhook, times);

    return res.json({
        "error": false,
        "message": "Sua pesquisa foi realizada com sucesso, você receberá os dados em seu webhook em até 5 minutos.",
        "query": query,
        "webhook": webhook
    });
    
}));

app.listen(9000, () =>
  console.log(`Example app listening on port ${9000}!`),
);