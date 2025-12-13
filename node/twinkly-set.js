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
        this.onMode = config.onMode || "movie";
        this.debug = config.debug;
        
        const twinkly = new Twinkly((msg, important) => {
            if (node.debug) node.warn(msg);
            if (important) node.status({fill:'red', shape:'dot', text: msg});
        }, config.address);

        // Render colors and intermediate colors
        function renderColors(colors, steps, presets)
        {
            // Boundary checks
            if (!colors || colors.length === 0)
                return [[255,255,255,255]];

            // Check / map / fix colors
            for (var c = 0; c < colors.length; c++) {
                let col = colors[c];
                if (typeof col === 'string' && presets) {
                    col = presets[col];
                }
                
                // Safety check: ensure col is an array with valid length
                if (!Array.isArray(col) || col.length < 3 || col.length > 4) {
                    colors[c] = [0,0,0,0];
                } else if (col.length === 3) {
                    colors[c] = [col[0],col[1],col[2],0];
                }
            }

            // Render intermediate colors - linear for now
            const stepFactor = 1 / steps;
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
            let mode = msg.hasOwnProperty('mode') ? msg.mode.toString() : null;
            let color = msg.hasOwnProperty('color') ? msg.color : null;

            var set = undefined;
            var brightnessSet = false;

            // Set brightness
            if (brightness) {
                let bri = parseInt(brightness);
                if (isNaN(bri) || bri < 0) bri = 0;
                if (bri > 100) bri = 100;
                set = twinkly.setBrightness(bri);
                brightnessSet = true;
            }

            // Set mode / power
            if (mode) {
                // Chain with brightness if it was set
                if (set) {
                    set = set.then(() => twinkly.ensureMode(mode));
                } else {
                    set = twinkly.ensureMode(mode);
                }
            } else if (power) {
                let isOn = power.toLowerCase() === 'on';
                if (isOn) {
                    // When turning on, ensure brightness is set BEFORE mode for modes that use brightness
                    // The API requires brightness to be non-zero before switching to movie/color/effect mode
                    const onModeStr = String(node.onMode || 'movie').toLowerCase();
                    const needsBrightnessCheck = (onModeStr === 'movie' || onModeStr === 'color' || onModeStr === 'effect');
                    
                    if (needsBrightnessCheck) {
                        // Always set brightness RIGHT BEFORE switching to movie/color/effect mode
                        // The API requires brightness to be explicitly set immediately before mode change
                        let targetBrightness;
                        
                        if (brightnessSet && brightness) {
                            // Brightness was explicitly set in message, use that value
                            targetBrightness = parseInt(brightness);
                            // Chain: wait for brightness set, then set brightness again before mode, then set mode
                            set = set
                                .then(() => twinkly.setBrightness(targetBrightness))
                                .then(() => twinkly.ensureMode(onModeStr))
                                .catch(error => {
                                    if (node.debug) node.warn(`[DEBUG] Error in brightness/mode chain: ${error.message}`);
                                    throw error;
                                });
                        } else {
                            // Need to check current brightness first
                            let brightnessPromise = set ? set.then(() => twinkly.getBrightness()) : twinkly.getBrightness();
                            set = brightnessPromise
                                .then(currentBrightness => {
                                    targetBrightness = currentBrightness === 0 ? 100 : Math.max(currentBrightness, 1);
                                    // Always set brightness right before mode change to ensure API is ready
                                    return twinkly.setBrightness(targetBrightness);
                                })
                                .then(() => twinkly.ensureMode(onModeStr))
                                .catch(error => {
                                    if (node.debug) node.warn(`[DEBUG] Error in brightness check/mode chain: ${error.message}`);
                                    throw error;
                                });
                        }
                    } else {
                        // For 'off' mode or when brightness is already set, just set the mode
                        let modePromise = set ? set.then(() => twinkly.ensureMode(onModeStr)) : twinkly.ensureMode(onModeStr);
                        set = modePromise;
                    }
                } else {
                    // Chain with brightness if it was set
                    if (set) {
                        set = set.then(() => twinkly.ensureMode('off'));
                    } else {
                        set = twinkly.ensureMode('off');
                    }
                }
            }

            // Set color mode - chain with existing operations to prevent race conditions
            // This ensures color operations happen after brightness/mode operations complete
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
                let colors = renderColors(color.colors, color.steps, color.presets);
                let colorPromise;
                if (color.mode === 'blink') {
                    colorPromise = twinkly.setBlinkingColors(colors, color.delay);
                } else if (color.mode === 'loop') {
                    colorPromise = twinkly.setLoopingColors(colors, color.delay);
                } else { // solid
                    colorPromise = twinkly.setColors(colors);
                }
                
                // Chain color operation with existing operations
                if (set) {
                    set = set.then(() => colorPromise);
                } else {
                    set = colorPromise;
                }
            }

            // Update State
            if (set) {
                set
                    .then(() => twinkly.isOn())
                    .then(state => {
                        node.status({fill:'green', shape:'dot', text: `${state ? 'ON' : 'OFF'}`});
                        done && done();
                    })
                    .catch(error => {
                        node.status({fill:'red', shape:'dot', text: 'Error'});
                        if (node.debug) node.warn(`[DEBUG] Error updating status: ${error.message}`);
                        done && done();
                    });
            } else {
                done && done();
            }
        });

        // Get power state on init - with retry for firmware update scenarios
        function updateInitialStatus() {
            twinkly.isOn()
                .then(state => {
                    node.status({fill:'green', shape:'dot', text: `${state ? 'ON' : 'OFF'}`});
                })
                .catch(error => {
                    // If initialization fails (e.g., after firmware update), show error status
                    // User can redeploy to re-initialize
                    node.status({fill:'yellow', shape:'dot', text: 'Init failed - redeploy'});
                    if (node.debug) node.warn(`[DEBUG] Initial status check failed: ${error.message}`);
                });
        }
        
        // Delay initial status check slightly to allow device to be ready after firmware update
        setTimeout(updateInitialStatus, 500);
    });
};
