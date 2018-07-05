const config = require('config');
const Srf = require('drachtio-srf');
const srf = new Srf();

srf.connect(config.get('drachtio'))
  .on('connect', (err, hostport) => {
    if (err) return console.error(`error connecting: ${err.message}`);
    console.log(`connected hostport: ${hostport}`);
  });

srf.register((req, res) => {
  res.send(200);
});

// example use of middleware to authenticate and stuff like that
srf.use('invite', (req, res, next) => {
  console.log(`incoming invite from ${req.source_address} with uri ${req.uri}`);
  if (!config.get('sipservers').some((w) => w.ip == req.source_address)) {
    return res.send(580, 'Sip Server Is Not Authenticated!');
  }
  next();
});

srf.invite((req, res) => {
  // at this point we have an authenticated request
  const uri = `${config.get('destination')};transport=udp`;
  srf.createB2BUA(req, res, uri)
    .then(({ uac, uas }) => {
      console.log(`call connected, initial call-ids ${uas.sip.callId} and ${uac.sip.callId}`);

      // we always have a pair of dialogs, so lets have each have a ref to the other
      uas.other = uac;
      uac.other = uas;
      setHandlers([uac, uas]);
      return;

    })
    .catch((err) => {
      console.log(`Error connecting call: ${err}`);
    });
});

function setHandlers(dialogs) {
  dialogs = Array.isArray(dialogs) ? dialogs : [dialogs];

  dialogs.forEach((dlg) => {
    dlg
      .on('destroy', () => dlg.other.destroy())
      .on('modify', (req, res) => {
        dlg.other.modify(req.body)
          .then(() => res.send(200, {body: dlg.other.remote.sdp}))
          .catch((err) => console.log(`Error handling reinvite: ${err}`));
      })
      .on('refer', handleRefer.bind(dlg));
  });
}
function handleRefer(req, res) {
  console.log(`handling refer on ${req.get('Call-ID')}`);
  const uri = req.get('refer-to').replace('<sip:', '').replace('>', '');
  return srf.createUAC(uri, {localSdp: this.other.remote.sdp})
    .then((dlg) => {
      console.log(`Connected new call leg on ${dlg.sip.callId}`);
      dlg.other = this.other;
      this.other.other = dlg;
      this.destroy();
      setHandlers(dlg);
      return;
    });
}
