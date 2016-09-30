/* jshint asi: true */

var NodeCache = require('node-cache')
var inherits = require('util').inherits
var underscore = require('underscore')

module.exports = function(homebridge) {
  var Characteristic = homebridge.hap.Characteristic
  var Service = homebridge.hap.Service
  var CommunityTypes = require('hap-nodejs-community-types')(homebridge)

  homebridge.registerAccessory("homebridge-accessory-neurio", "neurio", Neurio)

  function Neurio(log, config) {
    this.name = config.name
    this.location = require('url').parse('http://' + config.location + '/')
    this.serialNo = config.serialNo || this.location.hostname
    this.options = underscore.defaults(config.options || {}, { verboseP: false })

    this.log = log
    this.cache = new NodeCache({ stdTTL: config.ttl || 10 });
  }

  Neurio.PowerService = function(displayName, subtype) {
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
    function(callback) {
      var f = function(payload, cacheP) {
        if ((!payload) || (!payload.channels)) {
          this.log.error('fetchChannel cacheP=' + cacheP + ': ' + JSON.stringify(payload, null, 2))
          return
        }

        return underscore.find(payload.channels, function (entry) { return entry.type === 'CONSUMPTION' })
      }.bind(this)

      this.cache.get('neurio', function (err, result) {
        if (err) return callback(err)

        if (result) return callback(null, f(result, true))

        _roundTrip.bind(this)({ path: '/current-sample' }, function (err, response, result) {
          if (err) {
            this.log.error('_roundTrip error: ' + err.toString())
            return callback(err)
          }

          if (result) {
            this.cache.set('neurio', result)
            this.accessoryInformation.setCharacteristic(Characteristic.SerialNumber, result.sensorId)
          }

          callback(err, f(result, false))
        }.bind(this))
      }.bind(this))
    }

  , getVolts :
    function(callback) {
      this.fetchChannel(function(err, channel) {
        if (err) return callback(err)

        if (!channel) return callback()

        callback(null, Math.round(channel.v_V))
      }.bind(this))
    }

  , getVoltAmperes :
    function(callback) {
      this.fetchChannel(function(err, channel) {
        if (err) return callback(err)

        if (!channel) return callback()

        callback(null, Math.round(channel.q_VAR))
      }.bind(this))
    }

  , getWatts :
    function(callback) {
      this.fetchChannel(function(err, channel) {
        if (err) return callback(err)

        if (!channel) return callback()

        callback(null, Math.round(channel.p_W))
      }.bind(this))
    }

  , getKilowattHours :
    function(callback) {
      this.fetchChannel(function(err, channel) {
        if (err) return callback(err)

        if (!channel) return callback()

        callback(null, Math.round((channel.eImp_Ws - channel.eExp_Ws) / (60 * 60 * 1000)))
      }.bind(this))
    }

  , getServices: function() {
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

var _roundTrip = function (params, callback) {
  var self = this

  var request, timeoutP
  var client = self.location.protocol === 'https:' ? require('https') : require('http')

  params = underscore.extend(underscore.pick(self.location, [ 'protocol', 'hostname', 'port' ]), params)
  params.method = params.method || 'GET'
  params.headers = underscore.defaults(params.headers || {},
                                       { 'content-type': 'application/json; charset=utf-8', 'accept-encoding': '' })

  request = client.request(underscore.omit(params, [ 'useProxy', 'payload' ]), function (response) {
    var body = ''

    if (timeoutP) return
    response.on('data', function (chunk) {
      body += chunk.toString()
    }).on('end', function () {
      var payload

      if (params.timeout) request.setTimeout(0)

      if (self.options.verboseP) {
        console.log('[ response for ' + params.method + ' ' + params.protocol + '//' + params.hostname + params.path + ' ]')
        console.log('>>> HTTP/' + response.httpVersionMajor + '.' + response.httpVersionMinor + ' ' + response.statusCode +
                   ' ' + (response.statusMessage || ''))
        underscore.keys(response.headers).forEach(function (header) {
          console.log('>>> ' + header + ': ' + response.headers[header])
        })
        console.log('>>>')
        console.log('>>> ' + body.split('\n').join('\n>>> '))
      }
      if (Math.floor(response.statusCode / 100) !== 2) {
        self.log.error('_roundTrip error: HTTP response ' + response.statusCode)
        return callback(new Error('HTTP response ' + response.statusCode))
      }

      try {
        payload = (response.statusCode !== 204) ? JSON.parse(body) : null
      } catch (err) {
        return callback(err)
      }

      try {
        callback(null, response, payload)
      } catch (err0) {
        if (self.options.verboseP) console.log('callback: ' + err0.toString() + '\n' + err0.stack)
      }
    }).setEncoding('utf8')
  }).on('error', function (err) {
    callback(err)
  }).on('timeout', function () {
    timeoutP = true
    callback(new Error('timeout'))
  })
  if (params.payload) request.write(JSON.stringify(params.payload))
  request.end()

  if (!self.options.verboseP) return

  console.log('<<< ' + params.method + ' ' + params.protocol + '//' + params.hostname + params.path)
  underscore.keys(params.headers).forEach(function (header) { console.log('<<< ' + header + ': ' + params.headers[header]) })
  console.log('<<<')
  if (params.payload) console.log('<<< ' + JSON.stringify(params.payload, null, 2).split('\n').join('\n<<< '))
}
