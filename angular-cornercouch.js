// Copyright: 2013, Jochen Eddelbüttel
// MIT License applies
//
angular.module('CornerCouch', ['ng']).
factory('cornercouch', ['$http', function($http) {

    // Shorthand angular
    var ng = angular;
    
    function extendJSONP(config) {
        
        if (config.method === "JSONP")
            if (config.params)
                config.params.callback = "JSON_CALLBACK";
            else
                config.params = { callback: "JSON_CALLBACK" };
            
        return config;
    }
    
    function encodeUri(base, part1, part2) {
        var uri = base;
        if (part1) uri = uri + "/" + encodeURIComponent(part1);
        if (part2) uri = uri + "/" + encodeURIComponent(part2);
        return uri.replace('%2F', '/');
    }

    // Database-level constructor
    // Database name is required parameter
    function CouchDB(dbName, serverUri, getMethod) {
        
        // CouchDoc accesses the DB level via this variable in the closure
        var dbUri = encodeUri(serverUri, dbName);

        // Inner document constructor
        // Template object can be passed in and gets copied over
        function CouchDoc(init) {
            ng.copy(init || {}, this);
        }

        CouchDoc.prototype.load = function(id, docParams) {
            
            var config = {
                method: getMethod,
                url:    encodeUri(dbUri, id || this._id)
            };
            if (docParams) config.params = docParams;
            
            var doc = this;

            return $http(extendJSONP(config)).success( function (data) {
                ng.copy(data, doc);
            });
        };

        CouchDoc.prototype.save = function() {

            var config;
            if (this._id)
                config = { 
                    method: "PUT" ,
                    url:    encodeUri(dbUri, this._id)
                };
            else
                config = {
                    method: "POST",
                    url:    dbUri 
                };
            
            var doc = config.data = this;

            return $http(config).success( function (data) {
                if (data.id)  doc._id  = data.id;
                if (data.rev) doc._rev = data.rev;
            });
        };

        CouchDoc.prototype.remove = function() {

            return $http({
                method: "DELETE",
                url:    encodeUri(dbUri, this._id),
                params: { rev: this._rev }
            });
        };

        // Requires File-API 'file', sorry IE9
        CouchDoc.prototype.attach = function(file, name, reloadCB) {

            var doc = this;
            if (ng.isFunction(name)) { reloadCB = name; name = null; }

            return $http({
                method:     "PUT",
                url:        encodeUri(dbUri, doc._id, name || file.name),
                params:     { rev: doc._rev },
                headers:    { "Content-Type": file.type },
                data:       file
            })
            .success(function () {
                // Reload document for local consistency
                doc.load().success(reloadCB || ng.noop);
            });
        };

        CouchDoc.prototype.attachMulti = function(files, successCB) {
            var doc = this;
            var idx = 0;
            function loopCB() {
                if (idx < files.length)
                    doc.attach(files[idx], ++idx < files.length ? loopCB : successCB);
            };
            loopCB();
        }

        CouchDoc.prototype.detach = function(name) {

            var doc = this;
            
            return $http({
                method:     "DELETE",
                url:        encodeUri(dbUri, doc._id, name),
                params:     { rev: doc._rev }
            })
            .success(function () {
                // Reload document for local consistency
                doc.load();
            });
        };

        CouchDoc.prototype.attachUri = function (attachName) {
            return encodeUri(dbUri, this._id, attachName);
        };

        // Document constructor
        this.docClass = CouchDoc;

        // Basic fields
        this.uri  = dbUri;
        this.method = getMethod;

        // Query cursor
        this.rows = [];
        this.prevRows = [];
        this.nextRow = null;
        this.queryActive = false;
    }

    CouchDB.prototype.getInfo = function () {
        
        var db = this;
        return $http ({
            method:     "GET",
            url:        this.uri + "/"
        })
        .success(function(data) {
            db.info = data;
        });
    };
    
    CouchDB.prototype.newDoc = function(initData) {

        return new this.docClass(initData);

    };

    CouchDB.prototype.getDoc = function(id) {

        var doc = new this.docClass();
        doc.load(id);
        return doc;
    
    };

    CouchDB.prototype.getQueryDoc = function(idx) {

        var row = this.rows[idx];
        
        if (!row.doc) return this.getDoc(row.id);
        
        var doc = row.doc;
        
        if (doc instanceof this.docClass) return doc;

        doc = this.newDoc(doc);
        row.doc = doc;
        return doc;
    };

    function executeQuery(db) {
        
       db.queryActive = true;
       
       return $http(db.qConfig).success( function (data, dt, hd, config) {

            // Pop extra row for pagination
            if (config.params && config.params.limit) {
                if (data.rows.length === config.params.limit) {
                    db.nextRow = data.rows.pop();
                }
                else {
                    db.nextRow = null;
                }
            }
            if (config.append) {
                for (var i in data.rows) db.rows.push(data.rows[i]);
                delete db.qConfig.append;
            }
            else {
                db.rows = data.rows;
            }
            db.queryActive = false;

       }).error( function() { db.queryActive = false; });
    }

    CouchDB.prototype.queryView = function(viewURL, qparams)
    {
        var config = {
            method: this.method,
            url:    this.uri + viewURL
        };

        if (qparams) {
            // Raise limit by 1 for pagination
            if (qparams.limit) qparams.limit++;
            // Convert key parameters to JSON
            for (p in qparams) switch (p) {
                case "key":
                case "keys":
                case "startkey":
                case "endkey":
                    qparams[p] = ng.toJson(qparams[p]);
            }
            config.params = qparams;
        }

        this.qConfig = extendJSONP(config);
        return executeQuery(this);
    };

    CouchDB.prototype.query = function(design, view, qparams)
    {
        return this.queryView(
            "/_design/" + encodeURIComponent(design) +
            "/_view/"   + encodeURIComponent(view),
            qparams
        );
    };

    CouchDB.prototype.list = function(design, list, view, qparams)
    {
        return this.queryView(
            "/_design/" + encodeURIComponent(design) +
            "/_list/" + encodeURIComponent(list) +
            "/" + encodeURIComponent(view),
            qparams
        );
    };

    CouchDB.prototype.queryAll = function(qparams)
    {
        return this.queryView("/_all_docs", qparams);
    };

    CouchDB.prototype.queryRefresh = function()
    {
       return executeQuery(this);
    };

    CouchDB.prototype.queryNext = function()
    {
        var row = this.nextRow;
        if (row && !this.queryActive) {
            this.prevRows.push(this.rows[0]);
            this.qConfig.params.startkey = ng.toJson(row.key);
            if (row.id && row.id !== row.key)
                this.qConfig.params.startkey_docid = row.id;
            return executeQuery(this);
        }
        else return null;
    };

    CouchDB.prototype.queryMore = function()
    {
        var row = this.nextRow;
        if (row && !this.queryActive) {
            this.qConfig.params.startkey = ng.toJson(row.key);
            if (row.id && row.id !== row.key)
                this.qConfig.params.startkey_docid = row.id;
            this.qConfig.append = true;
            return executeQuery(this);
        }
        else return null;
    };

    CouchDB.prototype.queryPrev = function() {
        var row = this.prevRows.pop();
        if (row && !this.queryActive) {
            this.qConfig.params.startkey = ng.toJson(row.key);
            if (row.id && row.id !== row.key)
                this.qConfig.params.startkey_docid = row.id;
            return executeQuery(this);
        }
        else return null;
    };
    
    function CouchServer(url, getMethod) {
        if (url) {
            this.uri = url;
            this.method = getMethod || "JSONP";
            if (this.method !== "JSONP") {
                // Remote server with potential CORS support
                // Enable globally via $http defaults
                $http.defaults.withCredentials = true;
            }
        }
        else {
            this.uri = "";
            this.method = "GET";
        }
    }

    CouchServer.prototype.getDB = function(dbName) {
        return new CouchDB(dbName, this.uri, this.method);
    };
    
    CouchServer.prototype.getUserDB = function() {
        if (!this.userDB) this.userDB = this.getDB("_users");
        return this.userDB;
    };
    
    CouchServer.prototype.getUserDoc = function () {
        var db = this.getUserDB();
        if (this.userCtx.name)
            this.userDoc = db.getDoc("org.couchdb.user:" + this.userCtx.name);
        else
            this.userDoc = db.newDoc();
        return this.userDoc;
    };
    
    CouchServer.prototype.getInfo = function () {
        
        var server = this;
        return $http ({
            method:     "GET",
            url:        this.uri + "/"
        })
        .success(function(data) {
            server.info = data;
        });
    };
    
    CouchServer.prototype.getDatabases = function () {
        
        var server = this;
        return $http ({
            method:     "GET",
            url:        this.uri + "/_all_dbs"
        })
        .success(function(data) {
            server.databases = data;
        });
    };
    
    CouchServer.prototype.createDB = function(dbName) {
        var server = this;
        return $http ({
            method:     "PUT",
            url:        encodeUri(server.uri, dbName)
        })
        .success(function () {
            if (server.databases) server.databases.push(dbName);
        });
    };

    CouchServer.prototype.session = function() {
        
        var server = this;
        return $http ({
            method:     "GET",
            url:        this.uri + "/_session"
        })
        .success(function(data) {
            server.userCtx = data.userCtx;
        });
    };

    CouchServer.prototype.login = function(usr, pwd) {
        
        var body =
            "name="      + encodeURIComponent(usr) + 
            "&password=" + encodeURIComponent(pwd);
        
        var server = this;
        var userName = usr;
        return $http({
            method:     "POST",
            url:        this.uri + "/_session",
            headers:    { "Content-Type": 
                          "application/x-www-form-urlencoded" },
            data:       body.replace(/%20/g, "+")
        })
        .success(function(data) {
            delete data["ok"];
            server.userCtx = data;
            // name is null in POST response for admins as of Version 1.2.1
            // This patches over the problem
            server.userCtx.name = userName;
        });

    };

    CouchServer.prototype.logout = function() {
        
        var server = this;
        return $http ({
            method:     "DELETE",
            url:        this.uri + "/_session"
        })
        .success(function() {
            server.userCtx = { name: null, roles: [] };
            server.userDoc = { };
        });
    };
    
    CouchServer.prototype.getUUIDs = function(cnt) {
        
        var server = this;
        return $http ({
            method:     "GET",
            url:        this.uri + "/_uuids",
            params:     { count: cnt || 1 }
        })
        .success(function(data) {
            server.uuids = data.uuids;
        });
    };

    // This is 'cornercouch' - a factory for CouchServer objects
    return function (url, method) {
        return new CouchServer(url, method);
    };

}]);
