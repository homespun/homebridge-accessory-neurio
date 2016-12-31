/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

var NodeCache  = require('node-cache')
  , inherits   = require('util').inherits
  , roundTrip  = require('homespun-discovery').utilities.roundtrip
  , underscore = require('underscore')


module.exports = function (homebridge) {
  var Characteristic = homebridge.hap.Characteristic
    , Service = homebridge.hap.Service
    , CommunityTypes = require('hap-nodejs-community-types')(homebridge)

  homebridge.registerAccessory("homebridge-accessory-neurio", "neurio", Neurio)

  function Neurio(log, config) {
    if (!(this instanceof Neurio)) return new Neurio(log, config)

    this.log = log
    this.config = config || { platform: 'neurio' }

    this.location = require('url').parse('http://' + this.config.location + '/')
    this.name = this.config.name
    this.options = underscore.defaults(this.config.options || {}, { ttl: 10, verboseP: false })
    this.serialNo = this.config.serialNo || this.location.hostname

    this.cache = new NodeCache({ stdTTL: this.options.ttl })
  }

  Neurio.PowerService = function (displayName, subtype) {
    Service.call(this, displayName, '00000001-0000-1000-8000-135D67EC4377', subtype)
    this.addCharacteristic(CommunityTypes.Volts)
    this.addCharacteristic(CommunityTypes.VoltAmperes)
    this.addCharacteristic(CommunityTypes.Watts)
    this.addCharacteristic(CommunityTypes.KilowattHours)
  }
  inherits(Neurio.PowerService, Service)

/* GET http://a.b.c.d/current-sample returns

  { "sensorId"    : "0x0000............"
  , "timestamp"   : "2016-09-17T08:30:18Z"    // or 'NOT_SYNCHRONIZED'
  , "channels"    :
    [ { "type"  :   "PHASE_A_CONSUMPTION"
        ...
      }
    , { "type"    : "PHASE_B_CONSUMPTION"
        ...
      }
    , { "type"    : "CONSUMPTION"
      , "ch"      : 3                         // channel number
      , "eImp_Ws" : 88033131184               // Imported energy in watt-seconds
      , "eExp_Ws" : 339972                    // Exported energy in watt-seconds
      , "p_W"     : 14629                     // (Real) power in watts
      , "q_VAR"   : 70                        // Reactive power in volt-amps reactive
      , "v_V"     : 122.858                   // Voltage in volts
      }
    ]
  , "cts":
    [ { "ct"      : 1
      , "p_W"     : 7282
      , "q_VAR"   : 7
      , "v_V"     : 122.839
      }
    , ...
    ]
  }
 */

  Neurio.prototype =
  { fetchChannel :
    function (callback) {
      var self = this
      
      var f = function (payload, cacheP) {
        if ((!payload) || (!payload.channels)) {
          self.log.error('fetchChannel cacheP=' + cacheP + ': ' + JSON.stringify(payload, null, 2))
          return
        }

        return underscore.find(payload.channels, function (entry) { return entry.type === 'CONSUMPTION' })
      }

      self.cache.get('neurio', function (err, result) {
        if (err) return callback(err)

        if (result) return callback(null, f(result, true))

        roundTrip(underscore.defaults({ location: self.location, logger: self.log }, self.options),
                  { path: '/current-sample' }, function (err, response, result) {
          if (err) {
            self.log.error('roundTrip error: ' + err.toString())
            return callback(err)
          }

          if (result) {
            self.cache.set('neurio', result)
            self.accessoryInformation.setCharacteristic(Characteristic.SerialNumber, result.sensorId)
          }

          callback(err, f(result, false))
        })
      })
    }

  , getVolts :
    function (callback) {
      this.fetchChannel(function (err, channel) {
        if (err) return callback(err)

        if (!channel) return callback()

        callback(null, Math.round(channel.v_V))
      })
    }

  , getVoltAmperes :
    function (callback) {
      this.fetchChannel(function (err, channel) {
        if (err) return callback(err)

        if (!channel) return callback()

        callback(null, Math.round(channel.q_VAR))
      })
    }

  , getWatts :
    function (callback) {
      this.fetchChannel(function (err, channel) {
        if (err) return callback(err)

        if (!channel) return callback()

        callback(null, Math.round(channel.p_W))
      })
    }

  , getKilowattHours :
    function (callback) {
      this.fetchChannel(function (err, channel) {
        if (err) return callback(err)

        if (!channel) return callback()

        callback(null, Math.round((channel.eImp_Ws - channel.eExp_Ws) / (60 * 60 * 1000)))
      })
    }

  , getServices: function () {
      var myPowerService = new Neurio.PowerService("Power Functions")

      this.accessoryInformation = new Service.AccessoryInformation()
        .setCharacteristic(Characteristic.Name, this.name)
        .setCharacteristic(Characteristic.Manufacturer, "neur.io")
        .setCharacteristic(Characteristic.Model, "Home Energy Monitor")
        .setCharacteristic(Characteristic.SerialNumber, this.serialNo)

      myPowerService
        .getCharacteristic(CommunityTypes.Volts)
        .on('get', this.getVolts.bind(this))
      myPowerService
        .getCharacteristic(CommunityTypes.VoltAmperes)
        .on('get', this.getVoltAmperes.bind(this))
      myPowerService
        .getCharacteristic(CommunityTypes.Watts)
        .on('get', this.getWatts.bind(this))
      myPowerService
        .getCharacteristic(CommunityTypes.KilowattHours)
        .on('get', this.getKilowattHours.bind(this))

      return [ this.accessoryInformation, myPowerService ]
    }
  }
}
