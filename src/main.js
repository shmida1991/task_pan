'use strict';
const EventEmitter = require('events');
const needle = require('needle');
const fs = require('fs');
const path = require('path');
const lineByLine = require('n-readlines');
const MAX_IN_PROGRESS_MSG = 5;
const MIN_PROCESSING_TIME = 2000;
const SERVER_URI = 'http://35.195.195.133:9005/';
const INPUT_FILE = 'input.txt';
const OUTPUT_FILE = 'output.txt';

const app = () => {
    let eventBus = new EventEmitter();
    let liner = new lineByLine(path.join(__dirname, INPUT_FILE));
    let inProgress = Object.assign({});
    let queue = new Array();
    let inProgressQueue = [];

    // Deleting the output file if it exists
    if (fs.existsSync(path.join(__dirname, OUTPUT_FILE)))
        fs.unlinkSync(path.join(__dirname, OUTPUT_FILE));

    configureEvents();

    // Reading data from file
    let line;
    while (line = liner.next()) {
        eventBus.emit('data.read', line.toString('utf8'));
    }

    function configureEvents() {
        eventBus.on('data.read', (data) => {
            handleNewData(data);
        })
        eventBus.on('data.processed', ({
            rId,
            result
        }) => {
            inProgressQueue.pop();
            if (inProgress[rId]) {
                let dataFromFile = `${inProgress[rId].input} - ${result}\n`;
                //console.log(dataFromFile);
                //Deliting the item from InProgress dictionary
                clearInterval(inProgress[rId].intervalId);
                delete inProgress.rId;

                // Writring and poping next  intem
                eventBus.emit('data.write', dataFromFile);
                eventBus.emit('data.pop');
            }
        })
        eventBus.on('data.pop', () => {
            if (queue.length > 0) {
                let nextItem = queue.shift();
                handleNewData(nextItem);
            } else {
                console.log('Done');
            }
        })
        eventBus.on('data.write', (dataToWrite) => {
            fs.appendFile(path.join(__dirname, OUTPUT_FILE), dataToWrite, (err) => {
                if (err) console.log(err);
            });
        })
    }

    function handleNewData(data) {
        // Checking if the InProgress is not full
        if (inProgressQueue.length < MAX_IN_PROGRESS_MSG) {
            inProgressQueue.push(data);
            needle('post', SERVER_URI, {
                data: data
            }).then(res => {
                if (res.body && res.body.request_id) {
                    let requestedId = res.body.request_id;
                    let intervalId = setInterval((rId) => {
                        needle('get', `${SERVER_URI}?request_id=${rId}`).then(res => {
                            if (res.statusCode === 200) {
                                eventBus.emit('data.processed', {
                                    rId: rId,
                                    result: res.body.result
                                })
                            }
                        }).catch(console.log);
                    }, MIN_PROCESSING_TIME, requestedId)
                    inProgress[requestedId] = {
                        input: data.toString(),
                        intervalId: intervalId
                    }
                }
            }).catch(console.log);

        } else {
            queue.push(data);
        }
    }
}
app();