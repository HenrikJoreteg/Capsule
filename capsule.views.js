(function(){
  // Module Setup
  // ------------

  // All Capsule classes and modules are attached to the `Capsule` namespace
  // Exported for both CommonJS and the browser. Even though this will will
  // primarily used in a browser.
  var Capsule, Backbone, _, $ = this.jQuery || this.Zepto || function(){};
    if (typeof exports !== 'undefined') {
      Backbone = require('./backbone');
      _ = require('underscore')._;
      Capsule = exports;
    } else {
      Backbone = this.Backbone;
      _ = this._;
      Capsule = this.Capsule || (this.Capsule = {});
    }

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
      var newEl = ich[opts.templateKey](this.model.toTemplate());
      $(this.el).replaceWith(newEl);
      this.el = newEl;
      this.handleBindings();
      this.delegateEvents();
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
      var newEl = ich[opts.templateKey](this.model.toTemplate())[0];
      if (!this.el.parentNode) {
        $(this.containerEl)[opts.placement](newEl);
      } else {
        $(this.el).replaceWith(newEl);
      }
      this.el = newEl;
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
      var views = {};
      this.bindomatic(collection, 'add', function (model) {
        views[model.cid] = new ViewClass(_({model: model}).extend(options));
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
        });
      }, {trigger: true});
      this.bindomatic(collection, 'move', function () {
        _(views).each(function (view) {
          view.desist({quick: true});
        });
        views = {};
        collection.each(function (model) {
          views[model.cid] = new ViewClass(_({model: model}).extend(options));
        });
      });
    }
  });
})();