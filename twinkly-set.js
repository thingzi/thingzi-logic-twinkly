module.exports = function(RED) {
    'use strict';
    const { Twinkly } = require("./lib/twinkly");

    RED.nodes.registerType('thingzi-twinkly-set', function(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        if (!config.address) {
            node.status({fill:'red', shape:'dot', text:'Address not set'});
            return;
        }

        // Configuration
        this.debug = config.debug;
        
        const twinkly = new Twinkly((msg, important) => {
            if (node.debug) node.warn(msg);
            if (important) node.status({fill:'red', shape:'dot', text: msg});
        }, config.address);

        // Render colors and intermediate colors
        function renderColors(colors, steps)
        {
            // Boundary checks
            if (!colors || colors.length === 0)
                return [[255,255,255,255]];

            if (colors.length === 1 || steps === 1)
                return colors;

            // Check / fix colors
            for (var c = 0; c < colors.length - 1; c++) {
                let col = colors[c];
                if (col.length < 3 || col.length > 4) {
                    colors[c] = [0,0,0,0];
                } else if (col.length === 3) {
                    colors[c] = [col[0],col[1],col[2],0];
                }
            }

            // Render intermediate colors - linear for now
            const stepFactor = 1 / (steps - 1);
            let renderArray = [];
            for (var c = 0; c < colors.length; c++) {
                let c1 = colors[c];
                let c2 = colors[(c+1) % colors.length];
                for (var i = 0; i < steps; i++) {
                    let factor = stepFactor * i;
                    renderArray.push([
                        Math.round(c1[0] + factor * (c2[0] - c1[0])),
                        Math.round(c1[1] + factor * (c2[1] - c1[1])),
                        Math.round(c1[2] + factor * (c2[2] - c1[2])),
                        Math.round(c1[3] + factor * (c2[3] - c1[3]))
                    ]);
                }
            }

            return renderArray;
        }

        // handle incoming messages
        this.on("input", function(msg, send, done) {

            // Message properties (can be part of same message)
            let power = msg.hasOwnProperty('payload') ? msg.payload.toString() : null;
            let brightness = msg.hasOwnProperty('brightness') ? msg.brightness.toString() : null;
            let color = msg.hasOwnProperty('color') ? msg.color : null;

            // Set power
            if (power) {
                let isOn = power.toLowerCase() === 'on';
                twinkly.ensureOn(isOn)
                    .then(() => {
                        node.status({fill:'green', shape:'dot', text: isOn ? 'ON' : 'OFF'});
                    });
            }

            // Set brightness
            if (brightness) {
                let bri = parseInt(brightness);
                twinkly.setBrightness(bri);
            }

            // Set color mode
            if (color && color.colors && color.colors.length > 0) {

                // Ensure delay is always valid
                if (isNaN(color.delay)) {
                    color.delay = null;
                }

                // Check step count
                if (isNaN(color.steps) || color.steps < 1) {
                    color.steps = 1;
                }

                // Render colours
                let colors = renderColors(color.colors, color.steps);
                if (color.mode === 'blink') {
                    twinkly.setBlinkingColors(colors, color.delay);
                } else if (color.mode === 'loop') {
                    twinkly.setLoopingColors(colors, color.delay);
                } else { // solid
                    twinkly.setColors(colors);
                }
            }

            done && done();
        });

        // Get power state on init
        twinkly.isOn()
            .then(state => {
                node.status({fill:'green', shape:'dot', text: `${state ? 'ON' : 'OFF'}`});
            });
    });
};
