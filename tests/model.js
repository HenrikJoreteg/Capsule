// you can run these tests with the nodeunit test runner

capsule = require('../capsule');

var Person = capsule.Model.extend({
    type: 'person',
    initialize: function () {
        this.register();
    }
});

var Comment = capsule.Model.extend({
    type: 'comment',
    initialize: function () {
        this.register();
    }
});

var Comments = capsule.Collection.extend({
    type: 'comments',
    model: Comment,
    initialize: function () {
        this.register();
    }
});

var Post = capsule.Model.extend({
    type: 'post',
    initialize: function () {
        this.register();
        this.addChildCollection('comments', Comments);
    }
});

var Posts = capsule.Collection.extend({
    type: 'posts',
    model: Post,
    initialize: function () {
        this.register();
    }
});

var RootModel = capsule.Model.extend({
    type: 'app',
    initialize: function () {
        this.register();
        this.addChildCollection('posts', Posts);
        this.addChildModel('author', Person);
    }
});

function getApp() {
    var app = new RootModel();
    app.author.set({name: 'henrik'});
    app.posts.add(new Post({title: 'some post'}));
    
    app.posts.first().comments.add({title: 'something', body: 'something else'});
    
    return app;
};

exports.testXportImport = function (test) {
    var app1 = getApp();
    var app2 = new RootModel();
    test.ok(app1);
    app2.mport(app1.xport());
    test.deepEqual(app1.xport(), app2.xport(), "should both be the same");
    test.done();
};

exports.testEventBubbling = function (test) {
    var app = getApp();
    app.bind('publish', function (e) {
        test.equal(e.event, 'change');
        test.ok(e.id);
        test.equal(e.data.hello, true);
        test.done();
    });
    // do something to trigger an event in a nested model
    app.posts.first().comments.first().set({hello: true});
};