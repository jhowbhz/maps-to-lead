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
       // '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-canvas-aa',
        '--disable-2d-canvas-clip-aa',
        '--disable-gl-drawing-for-tests',
        '--disable-dev-shm-usage',
        '--no-zygote',
        '--use-gl=swiftshader',
        '--enable-webgl',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-first-run',
        '--disable-infobars',
        '--disable-breakpad',
        '--window-size=300,300',
        '--user-data-dir=./chromeData',
        '--disable-setuid-sandbox',
        '--disable-features=site-per-process',
    ],
    ignoreDefaultArgs: true,
    devtools: false,
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
        await page.waitForTimeout(time);
        let newHeight = limit ?? await page.evaluate(`document.querySelector("${scrollContainer}").scrollHeight`);
        if (newHeight === lastHeight) {
            break;
        }
        
        console.log(newHeight)
        lastHeight = newHeight;
    }
}

async function start(query, webhook, time){

    browser = await getBrowser();
    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(0)

    Promise.all([
        await page.goto('https://maps.google.com'),
        await page.waitForSelector('#searchboxinput'),
        await page.click('#searchboxinput'),
        await page.type('#searchboxinput', query),
        await page.keyboard.press('Enter'),
        await page.waitForSelector(SELECTORS.LISTING),
        await scroling(page, SELECTORS.SCROLL, 1000, time),
        await parseData(browser, webhook, await getData(page, 2))

    ]).then(() => {

        console.log('done')

    }).finally(() => {


    }).catch((err) => {
        
        console.log(err)

    });

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
                "price": place.price,
                "link": place.link,
                "image": place.image,
                "infos": [],
            }

            const infos = await page.$$('.Io6YTe');
            for (const info of infos)

                dados.infos.push(await page.evaluate(info => info.textContent, info));

                request.post({
                    headers: { 'Content-type' : 'application/json' },
                    url: webhook,
                    body: JSON.stringify(dados)
                }, function(error, response, body){
                    console.log('Send webhook:', error === null ? "Yes" : "No");
                });

            await page.close();
        });

        const pages = await browser.pages();

        if (pages.length > 1) {
            await pages[0].close();
            await pages[1].close();
        }

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