const { RequestQueue } = require("./request-queue");
const { Movie } = require("./movie");

class Twinkly {
    constructor(log, address)
    {
        const ip = address;
        this.log = log;
        this.requestService = new RequestQueue(log, `http://${ip}/xled/v1`);

        this.name = null;
        this.model = null;
        this.serialNumber = null;
        this.ledCount = null;
        this.ledProfile = null;
        this.initError = null;
        // Wrap queryDeviceInfo to catch errors and prevent Node-RED crashes
        this.initPromise = this.queryDeviceInfo()
            .then(() => {
                this.initError = null;
            })
            .catch(error => {
                this.handleInitError(error, ip);
            });
        
        // Ensure promise is handled to prevent uncaught rejections
        this.initPromise.catch(() => {});
    }

    handleInitError(error, ip = null) {
        // Connection errors: no response OR connection-related error codes/messages
        const errorCode = error.code || error.errno || (error.request && error.request.code);
        const errorMsgText = error.message || String(error);
        const connectionCodes = ['EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'];
        const isConnectionError = !error.response || 
            connectionCodes.includes(errorCode) ||
            /ECONN|connect|timeout|refused|unreachable/i.test(errorMsgText);
        
        const errorMsg = isConnectionError
            ? (ip ? `Can't connect to ${ip}` : `Can't connect to device`)
            : (ip ? `Init failed: ${errorMsgText}` : `Reinit failed: ${errorMsgText}`);
        
        this.initError = new Error(errorMsg);
        this.log(errorMsg, true);
    }

    queryDeviceInfo() {
        // Wrap in Promise.resolve() to ensure errors are caught immediately
        return Promise.resolve()
            .then(() => this.requestService.get("gestalt"))
            .then(json => {
                this.deviceName = json.device_name;
                this.model = json.product_code;
                this.serialNumber = json.hw_id;
                this.ledCount = json.number_of_led;
                this.ledProfile = json.led_profile;
                this.initError = null;
            })
            .catch(error => {
                // Re-throw to be caught by the outer catch handler
                // This ensures the error is properly propagated
                throw error;
            });
    }
    
    reinitialize() {
        this.initError = null;
        this.initPromise = this.queryDeviceInfo()
            .then(() => {
                this.initError = null;
            })
            .catch(error => {
                this.handleInitError(error);
            });
        
        this.initPromise.catch(() => {});
        return this.initPromise;
    }

    isOn() {
        return this.initPromise
            .then(() => {
                if (this.initError) {
                    throw new Error(this.initError.message);
                }
                return this.requestService.get("led/mode");
            })
            .then(json => json.mode !== "off" );
    }

    ensureOn(on = true) {
        return this.initPromise
            .then(() => {
                if (this.initError) {
                    throw new Error(this.initError.message);
                }
                return this.ensureMode(on ? "movie" : "off");
            });
    }

    getBrightness() {
        return this.initPromise
            .then(() => {
                if (this.initError) {
                    throw new Error(this.initError.message);
                }
                return this.requestService.get("led/out/brightness");
            })
            .then(json => json.value);
    }

    setBrightness(brightness) {
        return this.initPromise
            .then(() => {
                if (this.initError) {
                    throw new Error(this.initError.message);
                }
                return this.requestService.postJson("led/out/brightness", {type: "A", value: brightness});
            });
    }

    setColor(color) {
        return this.initPromise
            .then(() => {
                if (this.initError) {
                    throw new Error(this.initError.message);
                }
                if (!this.ledCount) {
                    throw new Error("LED count unknown");
                }
                return this.setMovie(Movie.repeatedColors(this.ledCount, [color]));
            });
    }

    setColors(colors) {
        return this.initPromise
            .then(() => {
                if (this.initError) {
                    throw new Error(this.initError.message);
                }
                if (!this.ledCount) {
                    throw new Error("LED count unknown");
                }
                return this.setMovie(Movie.repeatedColors(this.ledCount, colors));
            });
    }

    setBlinkingColors(colors, delay = 2000) {
        return this.initPromise
            .then(() => {
                if (this.initError) {
                    throw new Error(this.initError.message);
                }
                if (!this.ledCount) {
                    throw new Error("LED count unknown");
                }
                return this.setMovie(Movie.blinkingColors(this.ledCount, delay, colors));
            });
    }

    setTwinklingColors(colors, delay = 200) {
        return this.initPromise
            .then(() => {
                if (this.initError) {
                    throw new Error(this.initError.message);
                }
                if (!this.ledCount) {
                    throw new Error("LED count unknown");
                }
                return this.setMovie(Movie.twinklingColors(this.ledCount, 100, delay, colors));
            });
    }

    setLoopingColors(colors, delay = 500) {
        return this.initPromise
            .then(() => {
                if (this.initError) {
                    throw new Error(this.initError.message);
                }
                if (!this.ledCount) {
                    throw new Error("LED count unknown");
                }
                return this.setMovie(Movie.loopingColors(this.ledCount, delay, colors));
            });
    }

    setMovie(movie) {
        // Upload movie/animation data to the device
        // Requires device to be initialized (ledCount must be set)
        return this.initPromise
            .then(() => {
                if (this.initError) {
                    throw new Error(this.initError.message);
                }
                // Safety check: ensure LED count matches and is initialized
                // Prevents errors when device info hasn't loaded yet
                if (!this.ledCount || movie.ledCount !== this.ledCount) {
                    throw new Error(`LED mismatch: device ${this.ledCount || '?'} vs movie ${movie.ledCount}`);
                }
                return this.requestService.postOctet("led/movie/full", movie.getArray(this.ledProfile));
            })
            .then(() => this.requestService.postJson("led/movie/config", {
                frame_delay: movie.delay,
                frames_number: movie.frameCount,
                leds_number: movie.ledCount
            }));
    }

    setMode(mode) {
        return this.requestService.postJson("led/mode", {mode: mode});
    }

    ensureMode(mode) {
        return this.initPromise
            .then(() => {
                if (this.initError) {
                    throw new Error(this.initError.message);
                }
                // Don't enable if already on, because this causes the animation to re-start.
                return this.requestService.get("led/mode");
            })
            .then(json => json.mode !== mode ? this.setMode(mode) : json);
    }

    reset() {
        return this.requestService.get("reset");
    }
}

exports.Twinkly = Twinkly;
