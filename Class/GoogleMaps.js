const request = require('request')
const puppeteer = require('puppeteer');

const Parser = require('../Class/Parser')

module.exports = class GoogleMaps {

    static getBrowser = () => puppeteer.launch({
        autoSelectChrome: true,
        logLevel: 'verbose',
        args: [
            '--headless',
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
            '--window-size=600,1200',
            '--user-data-dir=./chromeData',
            '--disable-setuid-sandbox',
            '--disable-features=site-per-process',
        ],
        ignoreDefaultArgs: true,
        devtools: false,
    });

    static async parse(browser, webhook, finalData, hook){

        try {

            finalData.forEach(async (place) => {

                console.log('Parsing data...');
    
                const page = await browser.newPage();
                await page.setDefaultNavigationTimeout(0);
                await page.goto(place.link);
    
                let dados = {
                    "hook": hook ? hook : "",
                    "name": place?.name || '',
                    "rating": place?.rating || '0',
                    "pic": place?.image || '',
                    "formated": [],
                    "infos": [],
                }
    
                const infos = await page.$$('.Io6YTe');

                for (const info of infos){

                    dados.infos.push(await page.evaluate(info => info.textContent, info));
                    let number = Parser.checkNumber(dados)
    
                    dados.formated = {
                        "name": dados?.name ?? '',
                        "address": dados?.infos[0] ?? '',
                        "phone": number ?? '',
                        "whatsapp": number.length >= 11 ? `${ `https:/wa.me/${number}` ?? ''}` : '',
                    }
    
                    request.post({
                        headers: { 'Content-type' : 'application/json' },
                        url: webhook,
                        body: JSON.stringify(dados)
                    }, function(error, response, body){
                        console.log('Send webhook:', error === null ? "Yes" : "No");
                    });
                }

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

    static async getData(page) {

        try {

            const SELECTORS = {
                LISTING: process.env.LISTING,
                NAME: process.env.NAME,
                RATINGS: process.env.RATINGS,
                PRICE: process.env.PRICE,
                LINK: process.env.LINK,
                IMAGE: process.env.IMAGE
            }

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
            }, { selectors: SELECTORS });

        } catch (error) {
            console.log('Error getData:', error);
        }
    }

    static async scroll(page, scrollContainer, time, limit) {
        
        try {

            let lastHeight = await page.evaluate(`document.querySelector("${scrollContainer}").scrollHeight`);

            while (true) {
                await page.evaluate(`document.querySelector("${scrollContainer}").scrollTo(0, document.querySelector("${scrollContainer}").scrollHeight)`);
                await page.waitForTimeout(time);
                let newHeight = limit ?? await page.evaluate(`document.querySelector("${scrollContainer}").scrollHeight`);
                if (newHeight === lastHeight) {
                    break;
                }
                
                lastHeight = newHeight;
            }
            
        } catch (error) {
            console.log('Error scroll:', error);
        }
        
    }
}