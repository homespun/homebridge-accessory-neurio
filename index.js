/* jshint asi: true, esversion: 6, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

const debug      = require('debug')('neurio')
    , inherits   = require('util').inherits
    , moment     = require('moment')
    , roundTrip  = require('homespun-discovery').utilities.roundtrip
    , underscore = require('underscore')


module.exports = function (homebridge) {
  const Characteristic = homebridge.hap.Characteristic
      , Service = homebridge.hap.Service
      , CommunityTypes = require('hap-nodejs-community-types')(homebridge)

  homebridge.registerAccessory("homebridge-accessory-neurio", "neurio", Neurio)

  function Neurio(log, config) {
    if (!(this instanceof Neurio)) return new Neurio(log, config)

    this.log = log
    this.config = config || { accessory: 'neurio' }

    this.name = this.config.name
    this.options = underscore.defaults(this.config.options || {}, { ttl: 600, verboseP: false })
    if (this.options.ttl < 10) this.options.ttl = 600
    debug('options', this.options)

    this.location = require('url').parse('http://' + this.config.location + '/')
    this.serialNo = this.config.serialNo || this.location.hostname
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
      , "p_W"     : 14629                     // Real power in watts
      , "q_VAR"   : 70                        // Reactive power in volt-amps reactive
      , "v_V"     : 122.858                   // Voltage in volts
      }
    ]
  , "cts":
    [ { "ct"      : 1                         // CT enumeration
      , "p_W"     : 7282                      // Real power in watts
      , "q_VAR"   : 7                         // Reactive power in volt-amps reactive
      , "v_V"     : 122.839                   // Voltage in volts
      }
    , ...
    ]
  }
 */

  Neurio.prototype =
  { fetchChannel:
    function (callback) {
      const self = this

      if (!callback) callback = () => {}
      roundTrip(underscore.defaults({ location: self.location, logger: self.log }, self.options),
                { path: '/current-sample' }, function (err, response, result) {
        if (err) {
          self.log.error('roundTrip error: ' + err.toString())
          return callback(err)
        }

        if ((result) && (result.sensorId)) {
          self.accessoryInformation.setCharacteristic(Characteristic.SerialNumber, result.sensorId)
        }
        if ((!result) || (!result.channels)) {
          self.log.error('fetchChannel: ' + JSON.stringify(result, null, 2))
          return callback()
        }

        const channel = underscore.find(result.channels, function (entry) { return entry.type === 'CONSUMPTION' })

        self.fetchField(err, channel, 'p_W', function (err, value) {
          if ((!err) && (value !== undefined)) self.historyService.addEntry({ time: moment().unix(), power: value })
        })
        callback(null, channel)
      })
    }

  , fetchField:
    function (err, channel, field, callback) {
      if (err) return callback(err)

      if ((!channel) || (isNaN(channel[field]))) return callback()

      debug('fetchField', { field, value: channel[field] })
      callback(null, Math.round(channel[field]))
  }

  , getVolts:
    function (callback) {
      const self = this

      self.fetchChannel(function (err, channel) {
        self.fetchField(err, channel, 'v_V', callback)
      })
    }

  , getVoltAmperes:
    function (callback) {
      const self = this

      self.fetchChannel(function (err, channel) {
        self.fetchField(err, channel, 'q_VAR', callback)
      })
    }

  , getWatts:
    function (callback) {
      const self = this

      self.fetchChannel(function (err, channel) {
        self.fetchField(err, channel, 'p_W', callback)
      })
    }

  , getKilowattHours:
    function (callback) {
      this.fetchChannel(function (err, channel) {
        if (err) return callback(err)

        if ((!channel) || (isNaN(channel.eImp_Ws)) || (isNaN(channel.eExp_Ws))) return callback()

        callback(null, Math.round((channel.eImp_Ws - channel.eExp_Ws) / (60 * 60 * 1000)))
      })
    }

  , getServices: function () {
      const FakeGatoHistoryService = require('fakegato-history')(homebridge)
          , myPowerService = new Neurio.PowerService(this.name)

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

      this.displayName = this.name
      this.historyService = new FakeGatoHistoryService('energy', this, {
        storage: 'fs',
        disableTimer: true,
        path: homebridge.user.cachedAccessoryPath(),
        filename: this.location.host + '-neurio_persist.json'
      })

      setTimeout(this.fetchChannel.bind(this), 1 * 1000)
      setInterval(this.fetchChannel.bind(this), this.options.ttl * 1000)

      return [ this.accessoryInformation, myPowerService, this.historyService ]
    }
  }
}
