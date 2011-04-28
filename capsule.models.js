(function(){
  // Module Setup
  // ------------

  // All public Capsule classes and modules will be attached to the `Capsule` 
  // namespace. Exported for both CommonJS and the browser.
  var Capsule, Backbone, _, uuid, server = false;
    if (typeof exports !== 'undefined') {
      Backbone = require('./backbone');
      _ = require('underscore')._;
      uuid = require('../packages/uuid');
      Capsule = exports;
      server = true;
    } else {
      Backbone = this.Backbone;
      _ = this._;
      Capsule = this.Capsule || (this.Capsule = {});
    }
  
  // Our model hash, this is where all instantiated models are stored by id
  Capsule.models = {};
  
  // Capsule.Model
  // -------------
  
  // Extend the Backbone model with Capsule functionality
  Capsule.Model = Backbone.Model.extend({
    // ###register 
    // Register ourselves. This means generate a uuid if we're on the server
    // and listen for changes to ID (which you shouldn't really change) this just handles the
    // case where our root model is initted on the client, before it has any data. Once it gets
    // its `id` you shouldn't ever change it.
    // 
    // We also bind change so to our `publishChange` method.
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
      this.bind('change', _(this.publishChange).bind(this));
    },
    
    // ###addChildCollection
    // We use this to build our nested model structure. This will ensure
    // that `publish`, `add`, and `remove` events will bubble up to our root
    // model.
    addChildCollection: function (label, constructor) {
      this[label] = new constructor();
      this[label].bind('publish', _(this.publishProxy).bind(this));
      this[label].bind('remove', _(this.publishRemove).bind(this));
      this[label].bind('add', _(this.publishAdd).bind(this));
      this[label].parent = this;
    },
    
    // ###addChildModel
    // Adds a child model and ensures that various publish events will be proxied up
    // and that we store a reference to the parent.
    addChildModel: function (label, constructor) {
      this[label] = new constructor();
      this[label].bind('publish', _(this.publishProxy).bind(this));
      this[label].parent = this;
    },
    
    // ###modelGetter
    // Convenience method for retrieving any model, no matter where, by id.
    modelGetter: function (id) {
      return Capsule.models[id];
    },
    
    // ###toggle
    // checks and toggles boolean properties on the server.
    toggle: function (attrName) {
      var change = {};
      change[attrName] = !(this.get(attrName));
      this.setServer(change);
    },
    
    // ###deleteServer
    // Sends delete event for `id` to server.
    deleteServer: function () {
      socket.send({
        event: 'delete',
        id: this.id
      });
    },
    
    // ###toTemplate
    // This is a replacement for simply sending Backbone's `toJSON` data to the template.
    // Since we're using [ICanHaz.js](http://icanhazjs.com) which uses Mustache, using
    // this function lets us send function to the template. Useful for formatting, and other
    // calculated values.
    toTemplate: function () {
      var result = this.toJSON(),
        self = this;
      
      result.htmlId = this.cid;
      if (this.templateHelpers) {
        _.each(this.templateHelpers, function (val) {
          result[val] = _.bind(self[val], self);
        });
      }
      return result;
    },
    
    // ###xport
    // Our serializer. Builds and returns a simple object ready to be JSON stringified
    // By default it recurses through child models/collections unless you pass it `{recurse: false}`.
    // The recursion also includes protections from creating circular references.
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
          if (settings.recurse) {
            if (key !== 'collection' && source[key] instanceof Backbone.Collection) {
              targetObj.collections = targetObj.collections || {};
              targetObj.collections[key] = {};
              targetObj.collections[key].models = [];
              targetObj.collections[key].id = source[key].id || null;
              _.each(source[key].models, function (value, index) {
                process(targetObj.collections[key].models[index] = {}, value);
              });
            } else if (source[key] instanceof Backbone.Model && source[key].parent !== source) {
              targetObj.models = targetObj.models || {};
              process(targetObj.models[key] = {}, value);
            }
          }
        });
      }
      process(result, this);
      return result;
    },
    
    // ###mport
    // Our deserializer. Reinflates the model structure with data created by the `xport` function above.
    mport: function (data, silent) {
      function process(targetObj, data) {
        targetObj.id = data.id || null;
        targetObj.set(data.attrs, {silent: silent});
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
    
    // ###publishProxy
    // Primarily an internal method that just passes publish events up
    // through the model structure so those events can bubble.
    publishProxy: function (data) {
      this.trigger('publish', data);
    },
    
    // ###publishChange
    // Creates a publish event of type `change` for bubbling up the tree.
    publishChange: function (model, val, options, attr) {
      if (model instanceof Backbone.Model) {
        this.trigger('publish', {
          event: 'change',
          id: model.id,
          data: model.attributes
        });
      } else {
        console.error('event was not a model', e);
      }
    },
    
    // ###publishAdd
    // Convert `add` events to `publish` events for bubbling.
    publishAdd: function (model, collection) {
      this.trigger('publish', {
        event: 'add',
        data: model.xport(),
        collection: collection.id
      });
    },
    
    // ###publishRemove
    // Convert `remove` events to `publish` events for bubbling.
    publishRemove: function (model, collection) {
      this.trigger('publish', {
        event: 'remove',
        id: model.id
      });
    },
    
    // ###ensureRequired
    // Convenience for making sure a model has certain required attributes.
    ensureRequired: function () {
      var self = this;
      if (this.required) {
        _.each(this.required, function (type, key) {
          self.checkType(type, self.get(key), key);
        });
      }
    },
    
    // ###validate
    // Convenient default for Backbone's `validate` convention. It lets you do simple typechecking
    // on properties by supplying a `required` hash with property names and types 
    validate: function (attr) {
      var self = this;
      _.each(attr, function (value, key) {
        if (self.required && self.required.hasOwnProperty(key)) {
          var type = self.required[key];
          self.checkType(type, value, key);
        }
      });   
    },
    
    // ###checkType
    // Our simple typechecker, that just uses underscore's type checkers.
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
      if (!validator(value)) {
        throw "The '" + key + "' property of a '" + this.type + "' must be a '" + type + "'. You gave me '" + value + "'.";
      }
    },
    
    // ###setServer
    // Our server version of the normal `set` method. Takes a hash of attributes
    setServer: function(attrs, options) {
      socket.send({
        event: 'set',
        id: this.id,
        change: attrs
      });
    }
  });
  
  
  // Capsule.Collection
  // ------------------
  
  // Extend Backbone collection with Capsule functionality
  Capsule.Collection = Backbone.Collection.extend({
    
    // ###register
    // Generates an `id` if on server and sets it in our reference hash.
    register: function () {
      var self = this;
      if (server) {
        var id = uuid();
        this.id = id;
      }
      if (this.id && !Capsule.models[this.id]) Capsule.models[this.id] = this;
    },
    
    // ###addServer
    // The server version of backbone's `add` method.
    addServer: function (data) {
      socket.send({
        event: 'add',
        id: this.id,
        data: data
      });
    },
    
    // ###registerRadioProperties
    // A convenience for creating `radio` properties where you can specify an
    // Array of properties in a collection and ensure that only model can have that
    // property set to `true`.
    // If we're adding stuff we need to make sure the added items don't violate the
    // radio property rule if it's already set.
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
    
    // ###filterByProperty
    // Shortcut for returning an array of models in the collection that have a certain `name` / `value`.
    filterByProperty: function (prop, value) {
      return this.filter(function (model) {
        return model.get(prop) === value;
      });
    },
    
    // ###findByProperty
    // Shortcut for finding first model in the collection with a certain `name` / `value`.
    findByProperty: function (prop, value) {
      return this.find(function (model) {
        return model.get(prop) === value;
      });
    }
  });
})();