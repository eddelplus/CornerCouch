CornerCouch
===========

CornerCouch - AngularJS module for CouchDB

**Make sure to check the Wiki on GitHub for more information**

CornerCouch wraps the CouchDB core http APIs for documents, attachments, views, and sessions in three
JavaScript object classes: CouchServer, CouchDB, and CouchDoc. The 'CornerCouch' module exposes a
single resource 'cornercouch', which is the factory for CouchServer objects. CouchDoc is an inner
class of CouchDB and CouchDoc objects are automatically assocciated with a database.

On the AngularJS side CornerCouch relies on $http, providing a higher level http/REST interface of
its own, separate from $resource. Its sole dependency is the core AngularJS 'ng' module.

CornerCouch has been developed based on AngularJS 1.0.3 and CouchDB 1.2.0.
The upload of attachments depends on the HTML5 File API and does not support IE9 or older.
