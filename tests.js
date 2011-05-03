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
    
    app.posts.first().comments.add({subject: 'first', body: 'something else'});
    
    return app;
};

exports.testXportImport = function (test) {
    var app1 = getApp();
    var app2 = new RootModel();
    test.ok(app1);
    // import the export of app1 into app2
    app2.mport(app1.xport());
    test.deepEqual(app1.xport(), app2.xport());
    // reimporting shouldn't make a difference
    app2.mport(app1.xport());
    test.deepEqual(app1.xport(), app2.xport());
    test.done();
};

exports.testChangeEventBubbling = function (test) {
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

exports.testAddEventBubbling = function (test) {
    var app = getApp();
    app.bind('publish', function (e) {
        test.equal(e.event, 'add');
        test.ok(e.collection)
        test.equal(e.data.attrs.subject, 'something');
        test.done();
    });
    // do something to trigger an event in a nested model
    app.posts.first().comments.add({subject: 'something', body: 'something else'});
};

exports.testRemoveEventBubbling = function (test) {
    var app = getApp();
    app.bind('publish', function (e) {
        test.equal(e.event, 'remove');
        test.ok(e.id);
        test.done();
    });
    // do something to trigger an event in a nested model
    app.posts.first().comments.remove(app.posts.first().comments.first());
};

exports.testMoveEventBubbling = function (test) {
    var app = getApp();
    var com1 = new Comment({subject: 'second'});
    var com2 = new Comment({subject: 'third'});
    var comments = app.posts.first().comments;
    comments.add(com1);
    comments.add(com2);
    
    app.bind('publish', function (e) {
        test.equal(e.event, 'move');
        test.equal(e.collection, comments.id);
        test.equal(e.id, com2.id);
        test.equal(e.newPosition, 0);
        test.done();
    });
    
    comments.moveItem(com2.id, 0);
};