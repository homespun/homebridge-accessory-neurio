# homebridge-accessory-neurio
A [neur.io](http://neur.io) accessory plugin for [Homebridge](https://github.com/nfarina/homebridge).

# Installation
Run these commands:

    % sudo npm install -g homebridge
    % sudo npm install -g homebridge-accessory-neurio

On Linux, you might see this output for the second command:

    npm ERR! pcap2@3.0.4 install: node-gyp rebuild
    npm ERR! Exit status 1
    npm ERR!

If so, please try

    % apt-get install libpcap-dev

and try

    % sudo npm install -g homebridge-accessory-neurio

again!

# Configuration
Edit `~/.homebridge/config`, inside `"accessories": [ ... ]` add:

    { "accessory" : "neurio"
    , "name"      : "Home Energy Monitor"
    , "location"  : "a.b.c.d"

    // optional, here are the defaults
    , "options"   : { "ttl": 5, "verboseP" : false }
    }

How can you determine the IP address (`"a.b.c.d"`),
run [homespun-discovery](https://github.com/homespun/homespun-discovery),
of course.
