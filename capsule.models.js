/*global Backbone _ uuid */
(function(){
  // Initial Setup
  // -------------

  // The top-level namespace. All public Capsule classes and modules will
  // be attached to this. Exported for both CommonJS and the browser.
  var Capsule,
    server = false;
    
    if (typeof exports !== 'undefined') {
      var Backbone = require('./backbone'),
        _ = require('underscore')._,
        uuid = require('../packages/uuid');
      Capsule = exports;
      server = true;
    } else {
      var Backbone = this.Backbone,
        _ = this._;
      
      Capsule = this.Capsule = {};
    }

  Capsule.models = {};
  //Capsule.collections = {};
    
  Capsule.Model = Backbone.Model.extend({
    register: function () {
      var self = this;
      if (server) {
        var id = uuid();
        this.id = id;
        this.set({id: id});
      }
      if (this.id && !Capsule.models[this.id]) Capsule.models[this.id] = this;
      this.bind('change:id', function (model) {
        if (!Capsule.models[this.id]) Capsule.models[model.id] = self;
      });
    },
    
    modelGetter: function (id) {
      return Capsule.models[id];
    },
    
    toggle: function (attrName) {
      var change = {};
      change[attrName] = !(this.get(attrName));
      this.setServer(change);
    },
    
    deleteServer: function () {
      socket.send({
        event: 'delete',
        id: this.id
      });
    },
    
    // this lets us export js functions and not just attributes to
    // the template
    toTemplate: function () {
      var result = this.toJSON(),
        that = this;
      
      // by default we'll use the cid as the html ID
      result.htmlId = this.cid;

      if (this.templateHelpers) {
        _.each(this.templateHelpers, function (val) {
          result[val] = _.bind(that[val], that);
        });
      }
      
      return result;
    },
    
    // builds and return a simple object ready to be JSON stringified
    xport: function (opt) {
      var result = {},
        settings = _({
          recurse: true
        }).extend(opt || {});
      
      function process(targetObj, source) {
        targetObj.id = source.id || null;
        targetObj.cid = source.cid || null;
        targetObj.attrs = source.toJSON();
        _.each(source, function (value, key) {
          // since models store a reference to their collection
          // we need to make sure we don't create a circular refrence
          if (settings.recurse) {
            if (key !== 'collection' && source[key] instanceof Backbone.Collection) {
              targetObj.collections = targetObj.collections || {};
              targetObj.collections[key] = {};
              targetObj.collections[key].models = [];
              targetObj.collections[key].id = source[key].id || null;
              _.each(source[key].models, function (value, index) {
                process(targetObj.collections[key].models[index] = {}, value);
              });
            } else if (source[key] instanceof Backbone.Model) {
              targetObj.models = targetObj.models || {};
              process(targetObj.models[key] = {}, value);
            }
          }
        });
      }
      
      process(result, this);
      
      return result;
    },
    
    // rebuild the nested objects/collections from data created by the xport method
    mport: function (data, silent) {
      function process(targetObj, data) {
        targetObj.id = data.id || null;
        targetObj.set(data.attrs, {silent: silent});
        // loop through each collection
        if (data.collections) {
          _.each(data.collections, function (collection, name) {
            targetObj[name].id = collection.id;
            Capsule.models[collection.id] = targetObj[name];
            _.each(collection.models, function (modelData, index) {
              var newObj = targetObj[name]._add({}, {silent: silent});
              process(newObj, modelData);
            });
          });
        }
        
        if (data.models) {
          _.each(data.models, function (modelData, name) {
            process(targetObj[name], modelData);
          });
        }
      }
      
      process(this, data);
      
      return this;
    },
    
    publishProxy: function (data) {
      this.trigger('publish', data);
    },
        
    publishChange: function (model, val, options, attr) {
      var event = {};
      
      if (model instanceof Backbone.Model) {
        event = {
          event: 'change',
          id: model.id,
          data: model.attributes
        };
      } else {
        console.error('event was not a model', e);
      }
      
      this.trigger('publish', event);
    },
    
    publishAdd: function (model, collection) {
      var event = {
        event: 'add',
        data: model.xport(),
        collection: collection.id
      };
      
      this.trigger('publish', event);
    },
    
    publishRemove: function (model, collection) {
      var event = {
        event: 'remove',
        id: model.id
      };
      this.trigger('publish', event);
    },
    
    ensureRequired: function () {
      var that = this;
      if (this.required) {
        _.each(this.required, function (type, key) {
          that.checkType(type, that.get(key), key);
        });
      }
    },
    
    validate: function (attr) {
      var that = this;
      _.each(attr, function (value, key) {
        if (that.required && that.required.hasOwnProperty(key)) {
          var type = that.required[key];
          that.checkType(type, value, key);
        }
      });   
    },
    
    checkType: function (type, value, key) {
      var validator;
      
      type = type.toLowerCase();
      
      switch (type) {
        case 'string': validator = _.isString; break;
        case 'boolean': validator = _.isBoolean; break;
        case 'date': validator = _.isDate; break;
        case 'array': validator = _.isArray; break;
        case 'number': validator = _.isNumber; break;
      }
      
      // run it
      if (!validator(value)) {
        throw "The '" + key + "' property of a '" + this.type + "' must be a '" + type + "'. You gave me '" + value + "'.";
      }
    },
    
    setServer: function(attrs, options) {
        socket.send({
            event: 'set',
            id: this.id,
            change: attrs
        });
    }
  });

  Capsule.Collection = Backbone.Collection.extend({
    register: function () {
      var self = this;
      if (server) {
        var id = uuid();
        this.id = id;
      }
      if (this.id && !Capsule.models[this.id]) Capsule.models[this.id] = this;
    },
    
    addServer: function (data) {
      socket.send({
        event: 'add',
        id: this.id,
        data: data
      });
    },
    
    registerRadioProperties: function () {
      var collection = this;
      
      if (this.radioProperties) {
        _.each(this.radioProperties, function (property) {
          collection.bind('change:' + property, function (changedModel) {
            if (changedModel.get(property)) {
              collection.each(function (model) {
                var tempObj = {};
                if (model.get(property) && model.cid !== changedModel.cid) {
                  tempObj[property] = false;
                  model.set(tempObj);
                }
              });
            }
          });
          
          collection.bind('add', function (addedModel) {
            var tempObj = {};
            
            // if we're adding stuff we need to make sure the added items don't violate the
            // radio property rule if it's already set.
            if (collection.select(function (model) {
              return model.get(property);
            }).length > 1) {
              tempObj[property] = false;
              addedModel.set(tempObj);
            }
          });
        });
      }
    },
    
    filterByProperty: function (prop, value) {
      return this.filter(function (model) {
        return model.get(prop) === value;
      });
    },
    
    findByProperty: function (prop, value) {
      return this.find(function (model) {
        return model.get(prop) === value;
      });
    },
    
    parse: function (resp) {
      return resp.items;
    }
  });
})();