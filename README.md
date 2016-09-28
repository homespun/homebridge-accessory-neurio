# homebridge-accessory-neurio
A [neur.io](http://neur.io) accessory plugin for [Homebridge](https://github.com/nfarina/homebridge).

Initial commit. Nothing to see here. _Move along, move along._

# Installation
Run these commands:

    % sudo npm install -g homebridge
    % sudo npm install -g homebridge-accessory-neurio

# Configuration
Edit `~/.homebridge/config`, inside `"accessories": [ ... ]` add:

    { "accessory" : "neurio"
    , "name"      : "Home Energy Monitor"
    , "location"  : "a.b.c.d"

    // optional
    , "cache"     : 10
    , "options"   : { "verboseP": false }
    }

How can you determine the IP address (`"a.b.c.d"`),
run [homebridge-utility-discover](https://github.com/homespun/homebridge-utility-discover),
of course.

