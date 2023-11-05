FROM nodered/node-red:latest-minimal

COPY ./node /nodes/node

USER root
RUN cd /nodes/node && npm install
RUN cd /usr/src/node-red && npm install /nodes/node

USER node-red