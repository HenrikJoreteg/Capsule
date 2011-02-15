(function(){
  // Initial Setup
  // -------------

  // The top-level namespace. All public Backbone classes and modules will
  // be attached to this. Exported for both CommonJS and the browser.
  var Capsule,
    $ = this.jQuery || this.Zepto || function(){};
    
    if (typeof exports !== 'undefined') {
      var Backbone = require('./backbone'),
        _ = require('underscore')._;
      Capsule = exports;
    } else {
      var Backbone = this.Backbone,
        _ = this._;
      Capsule = this.Capsule = {};
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
    
    addReferences: function (hash) {
      var item;
      for (item in hash) {
        this['$' + item] = $(hash[item], this.el);
      }
    },
    
    autoSetInputs: function () {
      this.$(':input').keyup(_(this.genericKeyUp).bind(this));
    },
    
    genericKeyUp: function (e) {
      var res = {},
        target = $(e.target);
      if (e.which === 13 && e.target.tagName.toLowerCase() === 'input') target.blur();
      res[type = target.data('type')] = target.val();
      this.model.setServer(res);
      return false;
    },
    
    basicRender: function (templateKey) {
      var newEl = ich[this.template || templateKey](this.model.toTemplate());
      $(this.el).replaceWith(newEl);
      this.el = newEl;
      this.delegateEvents();
    }
  });
})();
