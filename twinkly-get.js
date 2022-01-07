module.exports = function(RED) {
    'use strict';
    const moment = require('moment');
    const { Twinkly } = require("./lib/twinkly");

    RED.nodes.registerType('thingzi-twinkly-get', function(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const fmt = 'D MMM, HH:mm:ss';

        if (!config.address) {
            node.status({fill:'red', shape:'dot', text:'IP address not set'});
            return;
        }

        // Configuration
        this.debug = config.debug;

        const twinkly = new Twinkly((msg, important) => {
            if (node.debug) node.warn(msg);
            if (important) node.status({fill:'red', shape:'dot', text: msg});
        }, config.address);

        // handle incoming messages
        this.on("input", function(msg, send, done) {
            node.status({});

            // Get brightness and 
            twinkly.getBrightness()
                .then(brightness => {
                    msg.brightness = brightness;
                    return twinkly.isOn();
                })
                .then(state => {
                    msg.payload = state ? 'ON' : 'OFF';
                    msg.twinkly = {
                        deviceName: twinkly.deviceName,
                        model: twinkly.model,
                        serialNumber: twinkly.serialNumber,
                        ledCount: twinkly.ledCount,
                        ledProfile: twinkly.ledProfile
                    };
                    node.status({fill:'green', shape:'dot', text: `${msg.payload} @ ${moment().format(fmt)}`});
                    node.send(msg);
                })
                .catch(error => {
                    node.log("ERROR: " + error.message);
                })
                .finally(() => done && done());
        });
    });
};
