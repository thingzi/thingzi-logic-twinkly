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
        this.initPromise = this.queryDeviceInfo();
    }

    queryDeviceInfo() {
        return this.requestService.get("gestalt")
            .then(json => {
                this.deviceName = json.device_name;
                this.model = json.product_code;
                this.serialNumber = json.hw_id;
                this.ledCount = json.number_of_led;
                this.ledProfile = json.led_profile;
            });
    }

    isOn() {
        return this.initPromise
            .then(() => this.requestService.get("led/mode"))
            .then(json => { 
                console.log(`MODE=${json.mode}`)
                return json.mode !== "off"
            });
    }

    ensureOn(on = true) {
        return this.initPromise
            .then(() => this.ensureMode(on ? "movie" : "off"));
    }

    getBrightness() {
        return this.initPromise
            .then(() => this.requestService.get("led/out/brightness"))
            .then(json => json.value);
    }

    setBrightness(brightness) {
        return this.initPromise
            .then(() => this.requestService.postJson("led/out/brightness", {type: "A", value: brightness}));
    }

    setColor(color) {
        return this.initPromise
            .then(() => this.setMovie(Movie.repeatedColors(this.ledCount, [color])));
    }

    setColors(colors) {
        return this.initPromise
            .then(() => this.setMovie(Movie.repeatedColors(this.ledCount, colors)));
    }

    setBlinkingColors(colors, delay = 2000) {
        return this.initPromise
            .then(() => this.setMovie(Movie.blinkingColors(this.ledCount, delay, colors)));
    }

    setTwinklingColors(colors, delay = 200) {
        return this.initPromise
            .then(() => this.setMovie(Movie.twinklingColors(this.ledCount, 100, delay, colors)));
    }

    setLoopingColors(colors, delay = 500) {
        return this.initPromise
            .then(() => this.setMovie(Movie.loopingColors(this.ledCount, delay, colors)));
    }

    setMovie(movie) {
        console.assert(movie.ledCount === this.ledCount);
        return this.initPromise
            .then(() => this.requestService.postOctet("led/movie/full", movie.getArray(this.ledProfile)))
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
            // Don't enable if already on, because this causes the animation to re-start.
            .then(() => this.requestService.get("led/mode"))
            .then(json => json.mode !== mode ? this.setMode(mode) : json);
    }

    reset() {
        return this.requestService.get("reset");
    }
}

exports.Twinkly = Twinkly;
