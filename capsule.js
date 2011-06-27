(function(){
  // Module Setup
  // ------------

  // All public Capsule classes and modules will be attached to the `Capsule` 
  // namespace. Exported for both CommonJS and the browser.
  var Capsule,
    Backbone,
    _,
    uuid;
    
    if (typeof exports !== 'undefined') {
      Backbone = require('backbone');
      _ = require('underscore')._;
      uuid = require('node-uuid');
      Capsule = exports;
    } else {
      Backbone = this.Backbone;
      _ = this._;
      
      Capsule = this.Capsule || (this.Capsule = {});
    }
  
  // Flag so we know if we're on the server or not
  Capsule.server = (typeof window == 'undefined');
  
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
      if (Capsule.server && !this.get('id')) {
        this.set({id: uuid()});
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
      this[label].bind('move', _(this.publishMove).bind(this));
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
    
    // ###safeSet
    // This should be used whenever getting changes from the browser since we 
    // can't trust the source. This checks to see if the properties being set
    // are in the `clientEditable` property of your model.
    // Also, `id`s can never be chaned with a safeSet.
    safeSet: function (attrs, user, errorCallback) {
      var self = this;
      _.each(attrs, function (value, key) {
        if (key !== 'id' && _(self.clientEditable).contains(key) && self.canEdit(user)) {
          self.set(attrs);
        } else {
          if (_.isFunction(errorCallback)) errorCallback('set', user, attrs);
        }
      });
    },
    
    // ###safeDelete
    // This should be used whenever getting a delete command from the browser since we 
    // can't trust the source. This checks for `immutable` properties in your models 
    // that can only be set once.
    safeDelete: function (user, errorCallback) {
      if (this.canEdit(user) && this.collection) {
        this.collection.remove(this);
      } else {
        if (_.isFunction(errorCallback)) errorCallback('delete', user, this);  
      }
    },
    
    // ###toggle
    // checks and toggles boolean properties.
    toggle: function (attrName) {
      var change = {};
      change[attrName] = !(this.get(attrName));
      this.set(change);
    },
    
    // ###toggleServer
    // checks and toggles boolean properties on the server.
    toggleServer: function (attrName) {
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
    
    // ###callServerMethod
    // Send a method call event. To trigger a model method on the server (if allowed).
    callServerMethod: function (method) {
      socket.send({
        event: 'method',
        id: this.id,
        method: method
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
            } else if (key !== 'parent' && source[key] instanceof Backbone.Model) {
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
        targetObj.set(data.attrs, {silent: silent});
        if (data.collections) {
          _.each(data.collections, function (collection, name) {
            targetObj[name].id = collection.id;
            Capsule.models[collection.id] = targetObj[name];
            _.each(collection.models, function (modelData, index) {
              var nextObject = targetObj[name].get(modelData.attrs.id) || targetObj[name]._add({}, {silent: silent});
              process(nextObject, modelData);
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
    publishChange: function (model) {
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
    
    // ###publishMove
    // Publishes a `move` event.
    publishMove: function (collection, id, newPosition) {
      this.trigger('publish', {
        event: 'move',
        collection: collection.id,
        id: id, 
        newPosition: newPosition
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
    setServer: function(attrs) {
      socket.send({
        event: 'set',
        id: this.id,
        change: attrs
      });
    },
    
    // ###unsetServer
    // Unsets a given property
    unsetServer: function(property) {
      socket.send({
        event: 'unset',
        id: this.id,
        property: property
      });
    },
    
    // ###safeCall
    // Checks to make sure a method is explicitly exposed and that the user canEdit the object
    // and the executes the method.
    safeCall: function (method, user, errorCallback) {
      if (this.exposedServerMethods && this.exposedServerMethods.indexOf(method) !== -1 && this.canEdit(user)) {
        this[method]();
      } else {
        if (_.isFunction(errorCallback)) errorCallback('call', user, method, this);
      }
    }
  });
  
  
  // Capsule.Collection
  // ------------------
  
  // Extend Backbone collection with Capsule functionality
  Capsule.Collection = Backbone.Collection.extend({
    
    // ###register
    // Generates an `id` if on server and sets it in our reference hash.
    register: function () {
      if (Capsule.server) this.id = uuid();
      if (this.id && !Capsule.models[this.id]) Capsule.models[this.id] = this;
    },
    
    // ###safeAdd
    // Is used to add items to the collection from an untrusted source (the client)
    // it inits the collection's model type. Sets the supplied properties on that new
    // empty object using `safeSet` passing it the error callback. If that works it 
    // will see if it passes the collection's `canAdd` test and add it.
    safeAdd: function (attrs, user, errorCallback) {
      var newObj = new this.model();
      if (this.canAdd(user)) {
        newObj.safeSet(attrs, user, errorCallback);
        this.add(newObj);
      } else {
        if (_.isFunction(errorCallback)) errorCallback('add', user, attrs, this);  
      }
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
    
    // ###moveServer
    // Send the `move` event
    moveServer: function (id, newPosition) {
      socket.send({
        event: 'move',
        collection: this.id,
        id: id,
        newPosition: newPosition
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
    },
    
    // ###setAll
    // Convenience for setting an attribute on all items in collection
    setAll: function (obj) {
      this.each(function (model) {
        model.set(obj);
      });
      return this;
    },
    
    // ###safeMove
    // the "I don't trust you" version of the move command which takes an error callback
    // so we can track who's messing with the system... and boot 'em :)
    safeMove: function (id, newPosition, user, errorCallback) {
      if (this.canMove(user)) {
        this.moveItem(id, newPosition);
      } else {
        if (_.isFunction(errorCallback)) errorCallback('move', user, id, newPosition);  
      }
    },
    
    // ###moveItem
    // Calculate position and move to new position if not in right spot.
    moveItem: function (id, newPosition) {
      var model = this.get(id),
        currPosition = _(this.models).indexOf(model);
      if (currPosition !== newPosition) {
        this.models.splice(currPosition, 1);
        this.models.splice(newPosition, 0, model);
        model.trigger('move', this, id, newPosition);
      }
    }
  });
  
  // #Capsule.View
  // Adding some conveniences to the Backbone view.
  Capsule.View = Backbone.View.extend({
    // ###handleBindings
    // This makes it simple to bind model attributes to the view.
    // To use it, add a `classBindings` and/or a `contentBindings` attribute
    // to your view and call `this.handleBindings()` at the end of your view's 
    // `render` function. It's also used by `basicRender` which lets you do 
    // a complete attribute-bound views with just this:
    //
    //     var ProfileView = Capsule.View.extend({
    //       template: 'profile',
    //       contentBindings: {
    //         'name': '.name'
    //       },
    //       classBindings: {
    //         'active': '' 
    //       },
    //       render: function () {
    //         this.basicRender();
    //         return this;
    //       }
    //     });
    handleBindings: function () {
      var self = this;
      if (this.contentBindings) {
        _.each(this.contentBindings, function (selector, key) {
          self.model.bind('change:' + key, function () {
            var el = (selector.length > 0) ? self.$(selector) : $(self.el);
            el.html(self.model.get(key));
          });
        });
      }
      if (this.classBindings) {
        _.each(this.classBindings, function (selector, key) {
          self.model.bind('change:' + key, function () {
            var newValue = self.model.get(key),
              el = (selector.length > 0) ? self.$(selector) : $(self.el);
            if (_.isBoolean(newValue)) {
              if (newValue) {
                el.addClass(key);
              } else {
                el.removeClass(key);    
              }
            } else {
              el.removeClass(self.model.previous(key)).addClass(newValue);
            }
          });
        });
      }
      return this;
    },
    
    // ###desist
    // This is method we used to remove/unbind/destroy the view.
    // By default we fade it out this seemed like a reasonable default for realtime apps. 
    // So things to just magically disappear and to give some visual indication that
    // it's going away. You can also pass an options hash `{quick: true}` to remove immediately.
    desist: function (opts) {
      opts || (opts = {});
      if (this.interval) {
        clearInterval(this.interval);
        delete this.interval;
      }
      if (opts.quick) {
        $(this.el).unbind().remove();
      } else {
        $(this.el).animate({
            height: 0,
            opacity: 0
          },
          function () {
            $(this).unbind().remove();
          }
        );
      }
    },
    
    // ###addReferences
    // This is a shortcut for adding reference to specific elements within your view for
    // access later. This is avoids excessive DOM queries and gives makes it easier to update
    // your view if your template changes. You could argue whether this is worth doing or not, 
    // but I like it.
    // In your `render` method. Use it like so:
    //     
    //     render: function () {
    //       this.basicRender();  
    //       this.addReferences({
    //         pages: '#pages',
    //         chat: '#teamChat',
    //         nav: 'nav#views ul',
    //         me: '#me',
    //         cheatSheet: '#cheatSheet',
    //         omniBox: '#awesomeSauce'
    //       });
    //     }
    //
    // Then later you can access elements by reference like so: `this.$pages`, or `this.$chat`.
    addReferences: function (hash) {
      for (var item in hash) {
        this['$' + item] = $(hash[item], this.el);
      }
    },
    
    // ###autoSetInputs
    // Convenience for automagically setting all input values on the server
    // as-you-type. This is letter-by-letter syncing. You have to be careful with this
    // but it's very cool for some use-cases.
    // To use, just add a `data-type` attribute in your html in your template that
    // tells us which property the input corresponds to. For example:
    //     
    //     <input data-type="title"/>
    //
    // Then if you call `this.autoSetInputs()` in your `render` function the values
    // will be sent to the server as you type.
    autoSetInputs: function () {
      this.$(':input').bind('input', _(this.genericKeyUp).bind(this));
    },
    
    // ###genericKeyUp
    // This is handy if you want to add any sort of as-you-type syncing
    // this is obviously traffic heavy, use wth caution.
    genericKeyUp: function (e) {
      var res = {},
        target = $(e.target),
        type;
      if (e.which === 13 && e.target.tagName.toLowerCase() === 'input') target.blur();
      res[type = target.data('type')] = target.val();
      this.model.setServer(res);
    },
    
    // ###basicRender
    // All the usual stuff when I render a view. It assumes that the view has a `template` property
    // that is the name of the ICanHaz template. You can also specify the template name by passing
    // it an options hash like so: `{templateKey: 'profile'}`.
    basicRender: function (opts) {
      opts || (opts = {});
      _.defaults(opts, {
          templateKey: this.template
      });
      var newEl = ich[opts.templateKey](this.addViewMixins(this.model.toTemplate()));
      $(this.el).replaceWith(newEl);
      this.el = newEl;
      this.handleBindings();
      this.delegateEvents();
    },
    
    // ###addViewMixins
    // Makes it possible for the view to definte `templateHelpers` array of functions
    // that will be sent to the mustache template for rendering. Great for formatting etc
    // especially when it's specific to that view and doesn't really belong in your model code.
    addViewMixins: function (obj) {
      var self = this;
      if (this.templateHelpers) {
        _.each(this.templateHelpers, function (val) {
          obj[val] = _.bind(self[val], self);
        });
        obj.team();
      }
      return obj;
    },
    
    // ###subViewRender
    // This is handy for views within collections when you use `collectomatic`. Just like `basicRender` it assumes
    // that the view either has a `template` property or that you pass it an options object with the name of the 
    // `templateKey` name of the ICanHaz template.
    // Additionally, it handles appending or prepending the view to its parent container.
    // It takes an options arg where you can optionally specify the `templateKey` and `placement` of the element.
    // If your collections is stacked newest first, just use `{plaement: 'prepend'}`.
    subViewRender: function (opts) {
      opts || (opts = {});
      _.defaults(opts , {
          placement: 'append',
          templateKey: this.template
      });
      var newEl = ich[opts.templateKey](this.addViewMixins(this.model.toTemplate()))[0];
      if (!this.el.parentNode) {
        $(this.containerEl)[opts.placement](newEl);
      } else {
        $(this.el).replaceWith(newEl);
      }
      this.el = newEl;
      this.handleBindings();
      this.delegateEvents();
    },
    
    // ##Binding Utilities (thanks to [@natevw](http://andyet.net/team/nate/))
    // ###bindomatic
    // You send it your model, an event (or array of events) and options.
    // It will bind the event (or events) and set the proper context for the handler 
    // so you don't have to bind the handler to the instance.
    // It also adds the function to an array of functions to unbind if the view is destroyed.
    bindomatic: function (model, ev, handler, options) {
      var boundHandler = _(handler).bind(this),
        evs = (ev instanceof Array) ? ev : [ev];
          _(evs).each(function (ev) {
            model.bind(ev, boundHandler);
          });
      if (options && options.trigger) boundHandler();
      (this.unbindomatic_list = this.unbindomatic_list || []).push(function () {
        _(evs).each(function (ev) {
          model.unbind(ev, boundHandler);
        });
      });
    },
    
    // ###unbindomatic
    // Unbinds all the handlers in the unbindomatic list from the model.
    unbindomatic: function () {
      _(this.unbindomatic_list || []).each(function (unbind) {
        unbind();
      });
    },
    
    // ###collectomatic
    // Shorthand for rendering collections and their invividual views.
    // Just pass it the collection, and the view to use for the items in the
    // collection. (anything in the `options` arg just gets passed through to
    // view. Again, props to @natevw for this.
    collectomatic: function (collection, ViewClass, options) {
      var views = {}, self = this;
      this.bindomatic(collection, 'add', function (model) {
        views[model.cid] = new ViewClass(_({model: model}).extend(options));
        views[model.cid].parent = self;
      });
      this.bindomatic(collection, 'remove', function (model) {
        views[model.cid].desist();
        delete views[model.cid];
      });
      this.bindomatic(collection, 'refresh', function () {
        _(views).each(function (view) {
          view.desist();
        });
        views = {};
        collection.each(function (model) {
          views[model.cid] = new ViewClass(_({model: model}).extend(options));
          views[model.cid].parent = self;
        });
      }, {trigger: true});
      this.bindomatic(collection, 'move', function () {
        _(views).each(function (view) {
          view.desist({quick: true});
        });
        views = {};
        collection.each(function (model) {
          views[model.cid] = new ViewClass(_({model: model}).extend(options));
          views[model.cid].parent = self;
        });
      });
    }
  });
  
})();