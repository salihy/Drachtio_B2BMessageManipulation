'use strict';

const config = require('config');
const Srf = require('drachtio-srf');
const parseUri = require('drachtio-sip').parser.parseUri;

const srf = new Srf();

var referArray = [];

var drachtioServer = {
    host: '',
    port: 0,
    secret:''
};// = config.get('drachtio');
var sipserverip = [];

if (process.env.DRACHTIO_HOST) {
    console.log("Dractio host: " + process.env.DRACHTIO_HOST);
    drachtioServer.host = process.env.DRACHTIO_HOST;
}
else {
    drachtioServer.host = config.get('drachtio').host;
}

if (process.env.DRACHTIO_PORT) {
    console.log("Dractio port: " + process.env.DRACHTIO_PORT);
    drachtioServer.port = process.env.DRACHTIO_PORT;
}
else {
    drachtioServer.port = config.get('drachtio').port;
}

if (process.env.DRACHTIO_SECRET) {
    console.log("Dractio secret: " + process.env.DRACHTIO_SECRET);
    drachtioServer.secret = process.env.DRACHTIO_SECRET;
}
else {
    drachtioServer.secret = config.get('drachtio').secret;
}

if (process.env.SIP_SERVER_IP) {
    console.log("SIP SERVER IP: " + process.env.SIP_SERVER_IP);
    sipserverip = process.env.SIP_SERVER_IP.split(',');
}

srf.connect(drachtioServer)
    .on('connect', (err, hostport) => {
        if (err) {
            return console.error(`error connecting: ${err.message}`);
        }
        console.log(`connected hostport: ${hostport}`);
    });


srf.register((req, res) => {
    
    res.send(200);
});


srf.use('invite', (req, res, next) => {
    console.log(`incoming invite from ${req.source_address} with uri ${req.uri}`);
    if (config.get('sipservers').filter(w => w.ip == req.source_address).length == 0 &&
        sipserverip.filter(w => w.ip == req.source_address).length == 0) {
        res.send(580, "Sip Server Is Not Authenticated!");
        return;
    }
    next();
});

//srf.on('request', (x) => {
//    console.log(JSON.stringify(x));
//    next();
//});

srf.use('request', (req, res, next) => {
    if (config.get('destination') == req.source_address) {
        res.send(200, 'Viases SBC System Response Ok');
    }
});

srf.invite((req, res) => {

    let inviteSent;
    var uri = '';

    if (process.env.SIP_DESTINATION) {

        uri = `${process.env.SIP_DESTINATION};transport=udp`;
    }
    else {
        uri = `${config.get('destination')};transport=udp`;
    }
    
    srf.createB2BUA(req, res, uri)
        .then(({ uac, uas }) => {
            console.log('connected');
            //var redirecteduac;

            uas.other = uac;
            uac.other = uas;


            console.log(`Refer event is added to uas, callid: ${uac.sip.callId}`);
            uas.on('refer', handleRefer.bind(uac));

            uac.on('refer', (requac, resuac) => {
                resuac.send(202, "Refer Accepted");
            });

            console.log(`Destroy event is added to uac, callid: ${uac.sip.callId}`);
            uac.on('destroy', () => {
                
                uac.other.destroy();
            });

            console.log(`Destroy event is added to uas, callid: ${uac.sip.callId}`);
            uas.on('destroy', (msg) => {
                if (referArray.includes(msg.headers["call-id"])) {
                    referArray = referArray.filter(f => f != msg.headers["call-id"]);
                }
                else {
                    uas.other.destroy();
                }
                
            });
        })
        .catch((err) => {
            console.log(`Error connecting call: ${err.message}`);
        });

});


function handleRefer(req, res) {
    res.send(202, "Refer Accepted");

    referArray.push(req.headers["call-id"]);

    srf.createUAC(req.headers['refer-to'].replace('<sip:', '').replace('>', ''), { localSdp: this.remote.sdp, headers: { from: this.remote.uri } })
        .then((referuac) => {
            console.log(`dialog established, call-id is ${referuac.sip.callId}`);
            this.modify(referuac.res.body);
            this.other.destroy();
            this.other = referuac;
            referuac.other = this;
            console.log(`Destroy event is added to referuac, callid: ${referuac.sip.callId}`);
            referuac.on('destroy', () => {
                referuac.other.destroy();
            });

            return;
        })
        .catch((err) => {
            console.error(`INVITE rejected with status: ${err}`);
            console.log(err.stack);
        });
}