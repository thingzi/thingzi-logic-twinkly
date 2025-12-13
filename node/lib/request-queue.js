const axios = require("axios");

const retryLimit = 2;

class RequestQueue {
    constructor(log, baseUrl) {
        this.log = log;
        this.baseUrl = baseUrl;
        this.queue = [];
        this.token = null;
        this.isAuthenticating = false;
        this.retryCount = 0;
    }

    authenticate() {
        // Authenticate with Twinkly device using challenge-response mechanism
        // Returns a promise that resolves on success or rejects on failure
        this.isAuthenticating = true;
        this.token = null;
        let challenge = {
            challenge: "00000000000000000000000000000000000000000000"
        };
        return this.postJson("login", challenge, true)
            .then(json => {
                this.token = json.authentication_token;
                let response = {
                    "challenge-response": json["challenge-response"]
                };
                return this.postJson("verify", response, true);
            })
            .then(() => {
                this.log("Authentication successful");
                this.isAuthenticating = false;
                this.nextRequest();
            })
            .catch((error) => {
                this.log("Authentication failure", true);
                this.isAuthenticating = false;
                this.token = null; // Clear token on failure
                // Reject the promise so callers know authentication failed
                throw error;
            });
    }

    nextRequest() {
        if (this.queue.length === 0 || this.isAuthenticating) {
            return;
        }

        this.performRequest(this.queue[0]);
    }

    performRequest(element) {
        let {request: req, resolve, reject, retryCount} = element;
        retryCount = retryCount || 0;

        req.baseURL = this.baseUrl;
        if (this.token) {
            req.headers = req.headers || {};
            req.headers["X-Auth-Token"] = this.token;
        } else if (!this.isAuthenticating) {
            return this.authenticate()
                .then(() => this.performRequest(element))
                .catch((authError) => {
                    this.log("Initial authentication failed", true);
                    reject(authError);
                });
        }

        this.log(`${req.method} ${req.baseURL}/${req.url}`);
        if (req.data) {
            this.log(req.data);
        }

        axios(req)
            .then(response => {
                this.log(response.data);
                resolve(response.data);
            })
            .catch(error => {
                if (error.response && error.response.status === 401) {
                    this.log("Auth token expired, re-authenticating");
                    this.token = null; // Clear invalid token
                    element.retryCount = retryCount + 1;
                    if (element.retryCount < retryLimit) {
                        // Re-authenticate and retry the request
                        this.authenticate()
                            .then(() => {
                                // Retry the original request after authentication
                                this.performRequest(element);
                            })
                            .catch((authError) => {
                                this.log("Re-authentication failed", true);
                                reject(authError);
                            });
                    } else {
                        this.log("Max retry limit reached for authentication", true);
                        reject(error);
                    }
                } else {
                    this.log(error.message, true);
                    reject(error);
                }
            });
    }

    addRequest(isAuth, request) {
        return new Promise((resolve, reject) => {
            let element = {
                request: request,
                resolve: resolve,
                reject: reject,
                retryCount: 0  // Track retries per request
            };
            if (isAuth) {
                this.performRequest(element);
            } else {
                this.queue.push(element);
                if (this.queue.length === 1) {
                    this.nextRequest();
                }
            }
        })
        .then(json => {
            if (!isAuth) {
                this.queue.shift();
            }
            this.nextRequest();
            return json;
        })
        .catch(error => {
            if (!isAuth) {
                this.queue.shift();
            }
            this.nextRequest();
            throw error;
        });
    }

    get(url, isAuth = false) {
        return this.addRequest(isAuth, {
            method: "GET",
            url: url,
            headers: {},
        });
    }

    post(url, body, mime, length, isAuth = false) {
        return this.addRequest(isAuth, {
            method: "POST",
            url: url,
            headers: {
                "Content-Type": mime,
                "Content-Length": length, // Twinkly fails to parse JSON without Content-Length header
            },
            data: body,
        });
    }

    postJson(url, postData, isAuth = false) {
        let json = JSON.stringify(postData);
        return this.post(url, json, "application/json", json.length, isAuth);
    }

    postOctet(url, octet, isAuth = false) {
        return this.post(url, octet, "application/octet-stream", octet.byteLength, isAuth);
    }
}

exports.RequestQueue = RequestQueue;
