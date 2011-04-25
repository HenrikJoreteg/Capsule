(function(){
  // Initial Setup
  // -------------

  // The top-level namespace. All Capsule classes and modules will
  // be attached to this. Exported for both CommonJS and the browser.
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


  Capsule.View = Backbone.View.extend({
    handleBindings: function () {
      var self = this;
      
      // content bindings
      if (this.contentBindings) {
        _.each(this.contentBindings, function (selector, key) {
          self.model.bind('change:' + key, function () {
            var el = (selector.length > 0) ? self.$(selector) : $(self.el);
            
            el.html(self.model.get(key));
          });
        });
      }
      
      // class bindings
      if (this.classBindings) {
        _.each(this.classBindings, function (selector, key) {
          self.model.bind('change:' + key, function () {
            var newValue = self.model.get(key),
            el = (selector.length > 0) ? self.$(selector) : $(self.el);
          
            // if it's a boolean value, just add/remove 'active' class
            if (_.isBoolean(newValue)) {
              if (newValue) {
                el.addClass(key);
              } else {
                el.removeClass(key);    
              }
              // otherwise remove the previous value and add the new one as a class.
            } else {
              el.removeClass(self.model.previous(key)).addClass(newValue);
            }
          });
        });
      }
      return this;
    },
    
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
    
    addReferences: function (hash) {
      var item;
      for (item in hash) {
        this['$' + item] = $(hash[item], this.el);
      }
    },
    
    autoSetInputs: function () {
      this.$(':input').bind('input', _(this.genericKeyUp).bind(this));
    },
    
    genericKeyUp: function (e) {
      var res = {},
        target = $(e.target),
        type;
      if (e.which === 13 && e.target.tagName.toLowerCase() === 'input') target.blur();
      res[type = target.data('type')] = target.val();
      this.model.setServer(res);
    },
    
    basicRender: function (opts) {
      opts || (opts = {});
      _.defaults(opts, {
          placement: 'append',
          templateKey: this.template
      });
      var newEl = ich[opts.templateKey](this.model.toTemplate());
      $(this.el).replaceWith(newEl);
      this.el = newEl;
      this.handleBindings();
      this.delegateEvents();
    },
    
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
    
    bindomatic: function (model, ev, handler, options) {
      var boundHandler = _(handler).bind(this),
        evs = (ev instanceof Array) ? ev : [ev];
          _(evs).each(function (ev) {
          model.bind(ev, boundHandler);
        });
        
      if (options && options.trigger) {
        boundHandler();
      }
      
      (this.unbindomatic_list = this.unbindomatic_list || []).push(function () {
        _(evs).each(function (ev) {
          model.unbind(ev, boundHandler);
        });
      });
    },
    
    unbindomatic: function () {
      _(this.unbindomatic_list || []).each(function (unbind) {
        unbind();
      });
    },
    
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