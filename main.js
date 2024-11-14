

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

const cache = {}

function checkAndCreateCache(calendar, calendarObjects) { 
    let calendarCache = cache[calendar.displayName]
    let noCache = false
    
    if (calendarCache) {
        // console.log(ical.parseICS(calendar)) 

        objs = calendarObjects.map(co => getVevent(ical.parseICS(co.data)));
        cacheLen = Object.keys(calendarCache).length
        if (cacheLen != objs.length) {
            console.log("length diff")
            noCache = true;
        } else {
            for (let event of objs) {
                if (!calendarCache[event.uid]) {
                    console.log("no event")
                    noCache = true;
                    break;
                }
                if (calendarCache[event.uid] != event.lastmodified.toString()) { 
                    console.log("no date")
                    noCache = true;
                    break;
                }
            }
        } 

    } else {
        console.log("no calendar")
        noCache = true;
    }

    if (noCache) {
        calendarCache = {}
        objs = calendarObjects.map(co => getVevent(ical.parseICS(co.data)));
        for (let event of objs) {
            if (!calendarCache[event.uid]) {
                calendarCache[event.uid] = event.lastmodified.toString();
            }
        }

        cache[calendar.displayName] = calendarCache;
        return false
    } else{
        return true
    }

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
        let refresh = false
        for (let cal of calendarsArr) {

            let ccal = calendars.find(c => c.displayName == cal[0])
            const calendarObjects = await client.fetchCalendarObjects({
                // timeRange: { startDate: new Date().toISOString(), endDate: dateAddDays(new Date(), 1).toISOString() },
                calendar: ccal,
            });

            if (!checkAndCreateCache(ccal, calendarObjects)) {
                refresh = true
                break
            }
        }
        
        console.log('refresh', refresh);
        if (!refresh) {
            return
        }
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
                schedule.scheduleJob(event.start, function () {
                    const hook = new Webhook(webhook);

                    hook.setUsername('Bot');


                    if (!event.summary || event.summary == "") {
                        event.summary = "Untitled event"
                    }
                    hook.send(`Event triggered: ${event.summary}`);
                });

            }
        }

        console.log("events refreshed")
    }
    scheduleTasks();
    let interval = setInterval(scheduleTasks, 60000 * 5)

    // let interval = setInterval(scheduleTasks, 10000)

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
})();