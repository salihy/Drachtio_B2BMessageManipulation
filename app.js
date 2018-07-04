'use strict';

const config = require('config');
const Srf = require('drachtio-srf');
const parseUri = require('drachtio-sip').parser.parseUri;
//const parser = require('drachtio-sip').parser;
var referArray = [];

const srf = new Srf();

srf.connect(config.get('drachtio'))
    .on('connect', (err, hostport) => {
        if (err) {
            return console.error(`error connecting: ${err.message}`);
        }
        console.log(`connected hostport: ${hostport}`);
    });


srf.register((req, res) => {
    res.send(200);
});

srf.invite((req, res) => {



    if (config.get('sipservers').filter(w => w.ip == req.source_address).length == 0) {
        res.send(580, "Sip Server Is Not Authenticated!");
        return;
    }

    let inviteSent;
    const uri = `${config.get('destination')};transport=udp`;

    srf.on('request', (x) => {
        console.log(JSON.stringify(x));
    });

    srf.createB2BUA(req, res, uri)
        .then(({ uac, uas }) => {
            console.log('connected');

            uas.on('refer', (requas, resuas) => {
                resuas.send(202, "Refer Accepted");

                //var referUri = parseUri(requas.headers['refer-to']);

                referArray.push(requas.headers["call-id"]);

                srf.createUAC(requas.headers['refer-to'].replace('<sip:', '').replace('>', ''), { localSdp: req.msg.body })
                    .then((referuac) => {
                        console.log(`dialog established, call-id is ${referuac.sip.callId}`);
                        //uac.on('destroy', () => console.log('called party hung up'));

                        uac.modify(referuac.req.body);
                        uas.destroy();
                        return;
                    })
                    .catch((err) => {
                        console.error(`INVITE rejected with status: ${err}`);
                        console.log(err.stack);
                    });
            });
            uac.on('refer', (requac, resuac) => {
                resuac.send(202, "Refer Accepted");
            });

            uac.on('destroy', () => {
                uas.destroy();
            });
            uas.on('destroy', (msg) => {
                if (referArray.includes(msg.headers["call-id"])) {
                    referArray = referArray.filter(f => f != msg.headers["call-id"]);
                }
                else {
                    uac.destroy();
                }
                
            });
        })
        .catch((err) => {
            console.log(`Error connecting call: ${err.message}`);
        });

});