

const caldav = require('tsdav');
const ical = require('node-ical');

const { Webhook } = require('discord-webhook-node');
const schedule = require('node-schedule');

function getVar(name) {
    let e = process.env[name] || '';
    if (e === '') {
        throw new Error(`${name} is not set`)
    };
    return e
}

function dateAddDays(date, days) {

    var result = date.setDate(date.getDate() + days);
    return new Date(result);
}

function getVevent(obj) {
    for (let entry of Object.entries(obj)) {
        if (entry[1]["type"] == "VEVENT") {
            return entry[1];
        }
    }
    return null
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
(async () => {
    const username = getVar("USERNAME");
    const password = getVar("PASSWORD");
    const serverUrl = getVar("SERVER_URL");
    const calendarsStr = getVar("CALENDARS");

    calendarsArr = calendarsStr.split(",").map(s => s.split("|"));

    console.log('username:', username);

    const client = await caldav.createDAVClient({
        serverUrl: serverUrl,
        credentials: {
            username: username,
            password: password,
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
    });

    const calendars = await client.fetchCalendars();


    let scheduleTasks = async () => {
        await schedule.gracefulShutdown()
        for (let cal of calendarsArr) {

            let ccal = calendars.find(c => c.displayName == cal[0])
            if (!ccal) continue;
            let webhook = cal[1]
 
            const calendarObjects = await client.fetchCalendarObjects({
                // timeRange: { startDate: new Date().toISOString(), endDate: dateAddDays(new Date(), 1).toISOString() },
                calendar: ccal,
            });
            

            objs = calendarObjects.map(co => getVevent(ical.parseICS(co.data)));
            for (let event of objs) {
                console.log(event.summary)
                schedule.scheduleJob(event.start, function () {
                    const hook = new Webhook(webhook);

                    hook.setUsername('Bot');

                    if (!event.summary || event.summary == ""){
                        event.summary = "Untitled event"
                    }
                    hook.send(`Event triggered: ${event.summary}`);
                });

            }
        } 

        console.log("events refreshed")
    }
    scheduleTasks();
    let interval = setInterval(scheduleTasks, 10000)//60000 * 10)

    exit = false

    process.on('SIGINT', function () {
        schedule.gracefulShutdown()
            .then(() => {
                clearInterval(interval);
                exit = true;
                process.exit(0)
            })
    })
    while (!exit) {
        await sleep(1000);
    }
    //   console.log(objs.map(o=>getDavObjField(o, "SUMMARY"))); 
})();