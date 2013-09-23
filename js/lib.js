/**
 * The MIT License (MIT)

 Copyright (c) Dmitri Snytkine

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */

var STORAGE = chrome.storage.local;
var STORAGE_KEY = "staying_alive_rules";
var BADGE_TITLE = "Staying Alive";

/**
 * Log debug message to console
 * @param string s String to log
 */
var d = function (s) {
    console.log("[" + (new Date().toLocaleTimeString()) + "] " + s);
}

// parseUri 1.2.2
// (c) Steven Levithan <stevenlevithan.com>
// MIT License
function parseUri(str) {
    var o = parseUri.options,
        m = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
        uri = {},
        i = 14;

    while (i--) uri[o.key[i]] = m[i] || "";

    uri[o.q.name] = {};
    uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
        if ($1) uri[o.q.name][$1] = $2;
    });

    return uri;
};

parseUri.options = {
    strictMode: false,
    key: ["source", "protocol", "authority", "userInfo", "user", "password", "host", "port", "relative", "path", "directory", "file", "query", "anchor"],
    q: {
        name: "queryKey",
        parser: /(?:^|&)([^&=]*)=?([^&]*)/g
    },
    parser: {
        strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
        loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
    }
};

/**
 * Make string with id based
 * on current time in milliseconds
 * @return {String}
 */
var makeId = function () {
    return 'h' + (new Date()).getTime();
}


String.prototype.startsWithDot = function () {
    return "." === this.charAt(0);
}

String.prototype.stripDot = function () {
    if ("." === this.charAt(0)) {
        return this.substring(1);
    }

    return this;
}

String.prototype.endsWithDomain = function (s) {
    return this.indexOf(s, this.length - s.length) !== -1;
}

if (typeof String.prototype.endsWith !== 'function') {
    String.prototype.endsWith = function (suffix) {
        return this.indexOf(suffix, this.length - suffix.length) !== -1;
    };
}


function getStoredItem() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY))
    } catch (e) {
    }
    return null
}

function persist(value, f) {

    if (!value) {
        value = ""
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    if (f && typeof f === 'function') {
        f();
    }
}

function getHostname(url) {

    var uri = parseUri(url);

    return uri['host'].toLowerCase();
}


/**
 * CLASSES DEFINITION
 * Prototype definition of DomainRule objects
 *
 */

/**
 * Constructor
 *
 * @param object o
 * @constructor
 */
var DomainRule = function (o) {
    this.id = o.id || null;
    this.ruleName = o.ruleName || null;
    this.uri = (o.uri) ? o.uri : null;
    this.loopUri = (o.loopUri && o.loopUri.length > 0) ? o.loopUri : null;
    this.rule = o.rule || null;
    this.requestInterval = (o.requestInterval) ? parseInt(o.requestInterval, 10) : 1;
    this.removeCookies = o.removeCookies || null;
    this.breakOnTabClose = !!(o.breakOnTabClose || false);
    this.extraHeader = o.extraHeader || null;

    this.fgUri = (o.fgUri) ? o.fgUri.toLocaleLowerCase() : null;
    this.fgTimeout = o.fgTimeout || null;
}

/**
 * Update values of the object with
 * values from passed in object
 *
 * The value of id is NOT updated
 *
 * @param o
 */
DomainRule.prototype.update = function (o) {
    console.log("Setting domain rule from object: " + JSON.stringify(o));
    this.ruleName = o.ruleName || null;
    this.uri = (o.uri) ? o.uri : null;
    this.loopUri = (o.loopUri && o.loopUri.length > 0) ? o.loopUri : null;
    this.rule = o.rule || null;
    this.requestInterval = (o.requestInterval) ? parseInt(o.requestInterval, 10) : 1;
    this.removeCookies = o.removeCookies || null;
    this.breakOnTabClose = !!(o.breakOnTabClose || false);
    this.extraHeader = o.extraHeader || null;

    this.fgUri = (o.fgUri) ? o.fgUri.toLocaleLowerCase() : null;
    this.fgTimeout = o.fgTimeout || null;
}


/**
 * Check passed uri agains uri, uri/, loopUri, loopUri/
 *
 * @param uri string
 * @returns boolean
 *
 * @todo in later version can be modified to match
 * by regular expression or by looking at placeholders in
 * this.uri or this.loopUri
 * for example http://example.com/dosomething?id={rand}
 */
DomainRule.prototype.isUriMatch = function (uri) {
    ret = uri === this.uri || (uri === (this.uri + '/') ) || uri === this.loopUri || (uri === (this.loopUri + '/') );

    return !!ret;
}

/**
 * If has this.loopUri then return it
 * otherwise return this.uri
 *
 * If this.uri is wildcard pattern then
 * loopUri must be defined? Or
 * maybe re-request uri that triggered
 * the match when was first requested by browser.
 *
 * If uri is wildcard then loopUri MUST be defined
 * and without a wildcard!
 * Otherwise the wildcard will cause the
 * rule to execute, then when completed it
 * will also match and added to scheduled loop.
 * This can be prevented if new loop is added
 * Only when called from browser tab.
 *
 * What if loopUri can have some 'random' placeholder
 * so that every new request add some random string to uri
 * for example viewthread.php?id={rand}
 * Each new request is then unique
 * but then 'uri' must have wildcard in it
 * viewthread.php?id={rand[100-500]}
 * or at least
 * viewthread.php?id=*
 *
 * Bottom line : in order to support random vars in loopUri
 * must support wildcard match in uri
 *
 * First relase will not have this option
 */
DomainRule.prototype.getLoopUri = function () {

    return this.loopUri || this.uri;
}

DomainRule.prototype.getInterval = function () {
    ret = (this.inverval < 1) ? 1 : parseInt(this.requestInterval, 10);

    return ret;
}

DomainRule.prototype.toString = function () {
    var ret = "";

    ret = JSON.stringify(this, ["uri", "ruleName", "loopUri", "requestInterval"])

    return ret;
}

DomainRule.prototype.hashCode = function () {
    var ret = CryptoJS.SHA1(this.uri + this.loopUri);

    return ret.toString(CryptoJS.enc.Hex);
}

DomainRule.prototype.equals = function (o) {

    if (null === o) {
        return false;
    }

    if (typeof o !== 'object') {
        return false;
    }

    /* if (!(o instanceof DomainRule)) {
     return false;
     }*/

    return o.hashCode() === this.hashCode();
}

// end DomainRule

/**
 * Object represents Rule that is currently schedule to run
 *
 * @param o
 * @param tabId
 * @constructor
 */
var RunningRule = function (o, tabId) {
    if (null === o || (typeof o !== 'object')) {
        throw Error("First param passed to RunningRule constructor must be instance of DomainRule");
    }

    this.rule = o;
    this.tabId = parseInt(tabId, 10);
    /**
     * Number of times rule was executed
     * @type {number}
     */
    this.counter = 0;

    /**
     * Time when this object was created
     * @type number milliseconds
     */
    this.initTime = (new Date()).getTime();

    /**
     * Initially latestTime equals to 0
     * @type {number}
     */
    this.latestTime = 0;
}

/**
 * Increment counter
 * and update latestTime to the epoch time in milliseconds
 */
RunningRule.prototype.incrementCounter = function () {
    var ts = (new Date()).getTime();
    this.counter += 1;
    this.latestTime = ts;
}

/**
 * Get number of milliseconds till next rule will run
 * This will not be exact number since
 * it probably took about a millisecond to
 * process and setup rule but this is a good
 * estimation that can be used to show
 * the time till rule is scheduled to run next time
 *
 * @returns {number}
 */
RunningRule.prototype.getNextRunTime = function () {
    var ret, ts = Date.now();
    var lastRun = (this.latestTime > 0) ? this.latestTime : this.initTime;
    ret = lastRun + (this.rule.getInterval() * 60 * 1000) - ts;

    return ret;
}

// end RunningRule


/**
 * Storage object that holds
 * RunningRule objects
 *
 */
/**
 * Initialize the underlying hashMap object
 * to an empty object
 * @constructor
 */
var RunningRules = function () {
    this.hashMap = {}
}

/**
 * Add RunningRule
 * If Rule represented by RunningRule
 * already added then ignore it
 *
 * @param o
 * @return boolean true if new rule was added false if
 * not added because rule with same hash already exists
 */
RunningRules.prototype.addRule = function (o) {
    var hash;
    if (null === o || (typeof o !== 'object')) {
        throw Error("object passed to RunningRules::addRule must be instance of RunningRule");
    }

    hash = o.rule.hashCode();
    console.log("RunningRules::addRule hash: " + hash);
    /**
     * If RunningRule for the Rule already in
     * the hashMap do not override it
     * because RunningRule also has start timestamp
     * and possibly counter
     */
    if (!this.hashMap.hasOwnProperty(hash)) {
        console.log("RunningRules::addRule hash not in map " + hash);
        this.hashMap[hash] = o;

        return true;
    }

    console.log("RunningRules::addRule hash already in map");

    return false;
}

/**
 * Check to see if the hashMap has property
 * for the supplied hash string
 *
 * @param hash string
 * @returns mixed mull|RunningRule object
 * @deprecated
 */
RunningRules.prototype.getRule = function (hash) {

    if (null === hash || (typeof hash !== 'string')) {
        throw new Error("hash param passed to getRule was not a String. :: " + (typeof hash));
    }

    console.log("hash passed to RunningRules.getRule() :: " + hash);
    if (this.hashMap.hasOwnProperty(hash)) {
        return this.hashMap[hash];
    }

    return null;
}

/**
 * Get DomainRule by value of id
 *
 * @param string id
 * @returns mixed null|DomainRule object
 */
RunningRules.prototype.getRuleById = function (id) {
    if (null === id || (typeof id !== 'string')) {
        throw new Error("id param passed to getRuleById was not a String. : " + (typeof id));
    }


    for (var p in this.hashMap) {
        if (this.hashMap.hasOwnProperty(p)) {

            if (id === this.hashMap[p].rule.id) {
                console.log("Found RunningRule with id: " + this.hashMap[p].rule.ruleName);
                return this.hashMap[p].rule;
            }
        }
    }

    return null;
}

/**
 * Return number of RunningRule objects stored
 * in this hashMap
 * @returns {number}
 */
RunningRules.prototype.size = function () {
    var ret = 0;
    for (var p in this.hashMap) {
        if (this.hashMap.hasOwnProperty(p)) {
            ++ret;
        }
    }

    return ret;
}

/**
 *
 * @param o DomainRule
 * @returns {*}
 */
RunningRules.prototype.hasRule = function (o) {
    var p, found = false;
    if (null === o || (typeof o !== 'object')) {
        throw Error("object passed to hasRule must be instance of DomainRule");
    }

    /**
     * First check by hashCode. Even if different rule
     * has the same hashCode then return true.
     * This means there is already a rule with
     * same uri and loopUri
     */
    if (this.hashMap.hasOwnProperty(o.hashCode())) {
        return true;
    }

    /**
     * Loop and check by id
     */
    for (p in this.hashMap) {
        if (this.hashMap.hasOwnProperty(p)) {
            if (o.id === this.hashMap[p].rule.id) {
                console.log("Found rule: " + o.ruleName + " by id: " + o.id + " in runningProcs");
                return true;
            }
        }
    }

    return false;
}


/**
 * Remove RunningRule that has matching tabId
 *
 * @param tabId
 * @return mixed null|object DomainRule that was added to
 * this RunningRules object with the matching tabId
 */
RunningRules.prototype.getDomainRuleByTabId = function (tabId) {
    var mytabId;
    tabId = parseInt(tabId, 10);

    for (var p in this.hashMap) {
        if (this.hashMap.hasOwnProperty(p)) {
            mytabId = this.hashMap[p].tabId;
            console.log("RunningRule tabId: " + mytabId);
            if (tabId === mytabId) {
                console.log("Found RunningRule with tabId: " + tabId);
                return this.hashMap[p].rule;
            }
        }
    }

    return null;
}
// end RunningRules
// END CLASSES DEFINITION

