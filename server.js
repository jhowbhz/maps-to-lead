require('dotenv').config()

const express = require('express')
const queue = require('express-queue');
const mysql = require('mysql');
const bodyparser = require('body-parser');

const GoogleMaps = require('./Class/GoogleMaps')
const Validation = require('./Class/Validation')

const app = express();
const queueMw = queue({ activeLimit: 2, queuedLimit: -1 });

app.use( bodyparser.json());
app.use(queueMw);

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

async function start(query, webhook, time, hook){

    const browser = await GoogleMaps.getBrowser();
    const page = await browser.newPage();

    const CONFIG = {
        LISTING: process.env.LISTING,
        SCROLL: process.env.SCROLL
    }

    page.setDefaultNavigationTimeout(0)

    Promise.all([
        await page.goto('https://maps.google.com'),
        await page.waitForSelector('#searchboxinput'),
        await page.click('#searchboxinput'),
        await page.type('#searchboxinput', query),
        await page.keyboard.press('Enter'),
        await page.waitForSelector(CONFIG.LISTING),
        await GoogleMaps.scroll(page, CONFIG.SCROLL, 1000, time),
        await GoogleMaps.parse(browser, webhook, await GoogleMaps.getData(page), hook)
    ]).then(() => {
        console.log('Response sent')
    }).catch((err) => {
        console.log(err)
    });

}

app.post('/find', async(req, res) => {

    if( Validation.validate(req.body) ){

        const query = req.body.query;
        const webhook = req.body.webhook;
        const times = req.body.time;
        const hook = req.body.hook;

        await start(query, webhook, times, hook);

        return res.json({
            "error": false,
            "message": "Sucesso, você receberá os dados em seu webhook em até 5 minutos.",
            "query": query,
            "webhook": webhook
        });

    }else{
        
        return res.status({
            "error": true,
            "message": "Erro, verifique se você enviou todos os dados corretamente."
        }, 400);
        
    }

});

app.listen(process.env.PORT, () =>
  console.log(`App listening on port ${process.env.PORT}!`),
);