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

/**
 * Logic for background page
 * to issue page requests in specific intervals
 *
 * @author Dmitri Snytkine
 */
/**
 * Some Logic:
 * If request url is on the list then:

 start re-requesting it via XHR - here result are not important in the response!
 we will monitor response in the extension itself!

 in the extension if request was by XHR then - may remove specific cookie!

 AND if statusLine contains 302 then remove this uri from runningProcs object

 Before every request check runningProcs hashMap
 after every result update object in the runningProcs
 with timestamp, and increment counter of successful requests


 Example how to remove specific header (must return from synchronous blocking call)
 chrome.webRequest.onHeadersReceived.addListener(function(details){
  if(details.method == "HEAD"){
    var redirUrl;
    details.responseHeaders.forEach(function(v,i,a){
      if(v.name == "Location"){
       redirUrl = v.value;
       details.responseHeaders.splice(i,1);
      }
    });
    details.responseHeaders.push({name:"redirUrl",value:redirUrl});
    return {responseHeaders:details.responseHeaders}; //I kill the redirect
  }
},
 {urls: ["<all_urls>"]},["responseHeaders","blocking"]);
 */


/**
 * Foreground rules logic
 *
 if url undefined then it is the same as before - do nothing
 if changed - check if foregroundRule is running for this tab
 if yes and it does not match the uri then remove it from runningForegroundRules
 remove pageAction icon.

 if match update count? No count is updated from inside content script via message.

 RunningForegroundRules - can be just regular js object.
 RunningForegroundRule (Rule, count, nextReloadTime, tabId)

 RunningForegroundRule constructor
 automatically sets this.nextReload based on Rule's timeout value
 has counter, nextReloadTime, tabId
 */

var runningProcs, iconImg, oData = {}, DOMAIN_RULES = [], foregroundRules = {};

iconImg = document.createElement('img');
iconImg.src = 'img/24/geek_zombie_24.png';


/**
 * Object that hold RunningRule objects
 * keeps track of background calls
 * schedule to be executed
 *
 * @type {RunningRules}
 */
runningProcs = new RunningRules();

var addHeader = function (url, allHeaders) {
    var sent = 0, i, j, ret = [], aExtraHeaders, myIcon, hostname, aHosts, domain, mydomain = false;

    chrome.browserAction.setTitle({title: BADGE_TITLE});

    /**
     * Get stored Data
     * if not set or value is empty
     * then nothing to do - just return back allHeaders
     *
     * Check url value for domain to match one of domain
     * in setting. If no match then return back allHeaders
     *
     * if match then add our extra header name/value
     * to allHeaders and return allHeaders
     */
    aExtraHeaders = oData[HEADERS_KEY];
    aHosts = oData[DOMAINS_KEY];

    if (!aExtraHeaders || aExtraHeaders.length < 1) {
        console.log('38 NO EXTRA HEADERS');
        return allHeaders;
    }

    hostname = getHostname(url);
    console.log('hostname: ' + hostname);
    console.log('aHosts count: ' + aHosts.length);
    console.log('extra headers count: ' + aExtraHeaders.length);


    if (aHosts.length > 0) {
        for (j = 0; j < aHosts.length; j += 1) {
            domain = aHosts[j];
            if (domain.startsWithDot()) {
                if (hostname.endsWithDomain(domain) || domain.stripDot() === hostname) {
                    mydomain = true;
                    break;
                }
            } else {
                if (hostname === domain) {
                    mydomain = true;
                    break;
                }
            }
        }
    }

    console.log('mydomain: ' + mydomain);
    if (!mydomain) {

        return allHeaders;
    }

    ret = allHeaders.slice();

    for (i = 0; i < aExtraHeaders.length; i += 1) {
        if (aExtraHeaders[i].value) {
            ret.push({name: aExtraHeaders[i].hname, value: aExtraHeaders[i].value});
            sent += 1;
        }
    }

    if (sent > 0) {
        d(sent + " Extra Header" + ((sent > 1) ? 's' : ''));
        myIcon = IconCreator.paintIcon(iconImg, '#0000FF');
        d('myIcon: ' + myIcon);
        chrome.browserAction.setIcon({imageData: myIcon});
        chrome.browserAction.setTitle({title: sent + " Extra Header" + ((sent > 1) ? 's' : '')});
    }

    return ret;
}

/**
 * If DomainRule has rule to require
 * certain http code to be returned with
 * each response then will check that response http code
 *
 * @param oRule
 * @param details
 * @returns {boolean}
 */
var isValidResponse = function (oRule, details) {

    var httpCode, ret = false;
    if (oRule.rule.ruleType === "httpCodeIs" && oRule.rule.ruleValue) {
        d("Looking for httpCodeIs " + oRule.rule.ruleValue);
        httpCode = details.statusLine.split(' ')[1];
        d("http code: " + httpCode);

        if (oRule.rule.ruleValue == httpCode) {
            ret = true;
        }
    }

    d("isValidResponse: " + ret);

    return ret;
}

var isValidTabid = function (tabId) {
    /**
     * @todo find if tab with this id exists in chrome
     * probably need to get all tabs and loop over them
     */
    return true;
}

/**
 * Flow of calls:
 *
 * 1. onUpdated event fired with 'loading' status:
 * handleTabUpdate::tabId 173 status: loading url: undefined <- url has not changed
 * If url is changed then url will not be undefined.
 * Also the url in tab object is always present.
 *
 * 2. content script is injected into page,
 * message received from content script here
 * Attempting to find foreground rule by uri
 *
 * 3. another onUpdatedEvent fired with 'complete' status
 * handleTabUpdate::tabId 173 status: complete url: undefined
 *
 * If url changed - check if fg rule for that tabId exists
 * and should be removed.
 * (in most cases should be remove, but not always. For example
 * if user navigated to different url but it still matching the rule then don't remove)
 *
 * If Rule is removed then also hide pageAction icon and reset title, popup, etc.
 *
 * @param tabId
 * @param changeInfo
 * @param tab
 */
var handleTabUpdate = function (tabId, changeInfo, tab) {
    d("handleTabUpdate::tabId " + tabId + " status: " + changeInfo.status + " url: " + changeInfo.url);
    d("handleTabUpdate Tab id: " + tab.id + " status: " + tab.status + " url: " + tab.url + " active: " + tab.active);
}

/**
 * Loop over all DOMAIN_RULES
 * and return first rule that has matching
 * foreground uri
 *
 * @param string uri
 * @returns mixed null|DomainRule object
 */
var getForegroundRuleForUrl = function (uri) {
    var i = 0, dr;

    if (!uri || uri.length === 0) {
        console.log("Empty string passed to getForegroundRuleForUrl");
        return false;
    }

    d("Looking for foreground rule for url " + uri);

    uri = uri.toLocaleLowerCase();

    for (i = 0; i < DOMAIN_RULES.length; i += 1) {
        dr = DOMAIN_RULES[i];

        if (dr.isForegroundMatch(uri)) {
            return dr;
        }
        /*if (dr.fgUri !== null) {

         if (uri.length >= dr.fgUri.length) {
         if (uri.indexOf(dr.fgUri) === 0) {
         console.log("Matched rule " + dr.ruleName);

         return dr;
         }
         }
         }*/
    }

    return null;
}

/**
 * Updated foregroundRules object for a specific rule
 * if rule already in foregroundRules
 * or add new rule to foregroundRules
 *
 * @param rule
 * @param tabId
 */
var updateForegroundRules = function (rule, tabId) {
    var id;
    if (null === oRule || (typeof oRule !== 'object')) {
        throw Error("updateForegroundRules parameter must be instance of DomainRule");
    }

    d("updateForegroundRules rule " + rule.ruleName + " tabId: " + tabId);
    id = rule.id;
    if (foregroundRules.hasOwnProperty(id)) {
        d("updateForegroundRules. Rule is already running: " + rule.ruleName + " tabId: " + tabId);
        foregroundRules[id].update();

    } else {
        foregroundRules[id] = new RunningForegroundRule(rule, tabId);
        d("updateForegroundRules. Added foreground rule: " + rule.ruleName + " tabId: " + tabId);
    }

    /**
     * @todo add pageAction icon and set icon text and link for tabId
     */
}

var removeForegroundRule = function (rule) {
    var tabId, id = rule.id;
    if (foregroundRules.hasOwnProperty(id)) {
        d("removeForegroundRule for rule: " + rule.ruleName);

        tabId = foregroundRules[id]['tabId'];
        /**
         * hide browserAction icon for tab
         */
        delete(foregroundRules[id]);
        /**
         * @todo if tabId exists in browser
         * hide icon and unset title of text
         */
    } else {
        d("removeForegroundRule Rule " + rule.ruleName + " is not in the foregroundRules");
    }
}

/**
 * Given a value of tabId find RunningForegroundRule
 * in foregroundRules object and remove rule from foregroundRules
 * This function will be called when tab is closed
 *
 * @param tabId
 */
var removeForegroundRuleByTabId = function (tabId) {
    var foundId;
    for (var id in foregroundRules) {
        if (foregroundRules.hasOwnProperty(id)) {
            if (foregroundRules[id]['tabId'] === tabId) {
                foundId = id;
                d("Found Running Foreground rule by tabId: " + tabId + " rule: " + foregroundRules[foundId]['rule']['ruleName']);
                break;
            }
        }
    }

    if (foundId) {
        delete(foregroundRules[foundId]);
    }
}

/**
 * Find DomainRule is foregroundRules object by given tabId
 * This function is called when url in tab is changed
 * Then we need to find - do we have running foreground rule for this tab?
 * if yes then we will try to match the new url agains this rule
 * to see if it still matches.
 * if not then we will remove the rule from foregroundRules and remove
 * pageAction icon from tab.
 *
 * @param tabId
 * @returns mixed DomainRule | null
 */
var getForegroundRuleByTabId = function (tabId) {

    d("Looking for foregroundRule for tab: " + tabId);
    for (var id in foregroundRules) {
        if (foregroundRules.hasOwnProperty(id)) {
            if (foregroundRules[id]['tabId'] === tabId) {
                d("foreground rule found for tabId " + tabId + " rule: " + foregroundRules[id]['rule']['ruleName']);

                return foregroundRules[id]['rule'];
            }
        }
    }

    d("foreground rule not found for tabId " + tabId);
    
    return null;
}

/**
 * Updated foregroundRules object for a specific rule
 * if rule already in foregroundRules
 * or add new rule to foregroundRules
 *
 * @param rule
 * @param tabId
 */
var updateForegroundRules = function (rule, tabId) {
    var id;
    if (null === oRule || (typeof oRule !== 'object')) {
        throw Error("updateForegroundRules parameter must be instance of DomainRule");
    }

    id = rule.id;
    if (foregroundRules.hasOwnProperty(id)) {
        d("updateForegroundRules. Rule is already running: " + rule.ruleName + " tabId: " + tabId);
        foregroundRules[id].update();

    } else {
        foregroundRules[id] = new RunningForegroundRule(rule, tabId);
        d("updateForegroundRules. Added foreground rule: " + rule.ruleName + " tabId: " + tabId);
    }

    /**
     * @todo add pageAction icon and set icon text and link for tabId
     */
}

var removeForegroundRule = function (rule) {
    var tabId, id = rule.id;
    if (foregroundRules.hasOwnProperty(id)) {
        d("removeForegroundRule for rule: " + rule.ruleName);

        tabId = foregroundRules[id]['tabId'];
        /**
         * hide browserAction icon for tab
         */
        delete(foregroundRules[id]);
        /**
         * @todo if tabId exists in browser
         * hide icon and unset title of text
         */
    }
}

/**
 * Format all request headers
 * and return multi-line string with
 * one header:value per line
 *
 * @param a
 * @returns {string}
 */
var printHeaders = function (a) {

    var ret = "";
    ret += (typeof a);
    a.forEach(function (h) {
        ret += "\n" + h.name + ": " + h.value;
    })

    return ret;
}

/**
 * Remove incoming cookie
 * This prevents the cookie sent by server from
 * being added to the browser.
 *
 * @param details object
 * @param name string name of cookie to remove
 */
var removeCookie = function (details, name) {
    var removed = false;
    name += "=";
    d("Trying to remove cookie: " + name);
    details.responseHeaders.forEach(function (v, i, a) {

        /**
         * Normalize header name to lower case
         * to account for possible different variations
         */
        var hName = v.name.toLowerCase();
        if (hName == "set-cookie" && v.value.indexOf(name) !== -1) {
            d("removing " + name + " cookie: " + v.value);
            details.responseHeaders.splice(i, 1);
            removed = true;
        }
    });

    if (removed) {
        d("removed " + name + " cookie");
    }
}

/**
 * Remove cache related headers from response
 * If cache control headers are not removed
 * the ajax request may use cached data and not
 * issue request to server.
 * This will break the request loop
 * because only a successful response for rule uri
 * schedules a new response
 *
 * @param details
 */
var removeCacheHeaders = function (details) {
    var removed = 0;

    details.responseHeaders.forEach(function (v, i, a) {
        /**
         * Important to do case-insensitive search for header names
         * Some servers send these headers using different case variations
         */
        var headerName = v.name.toLowerCase();
        if (headerName == "expires" || headerName == "last-modified" || headerName == "cache-control" || headerName == "etag") {
            d("Removing cache header: " + v.name);
            details.responseHeaders.splice(i, 1);
            removed++;
        }
    });

    if (removed > 0) {
        d("Removed " + removed + " Cache control headers");
    }
}


/**
 * This function is called from tab and also from background page
 * if called from tab then attempt to
 * add new RunningRule to runningProcs object
 * and if new rule is added update the browserAction badge with new count
 * of running rules
 *
 * @param oRule
 * @param fromTabId
 * @returns {boolean}
 */
var addToCallsInProgress = function (oRule, fromTabId) {

    var counter = runningProcs.size();
    if (!fromTabId && runningProcs.hasRule(oRule)) {
        d("There is  already the same rule in runningProcs");
        scheduleRule(oRule);
        return true;
    }

    if (counter > 9) {
        d("There are 10 Running rules already in progress. Cannot add any more");
        return false;
    }

    if (runningProcs.addRule(new RunningRule(oRule, fromTabId))) {
        scheduleRule(oRule);
        counter = (counter + 1).toString();
        d("Counter of running rules: " + (counter));

        chrome.browserAction.setBadgeText({text: counter})
        chrome.browserAction.setTitle({title: oRule.ruleName + " tab: " + fromTabId});
    } else {
        d("Rule not added. Possible because same rule already exists in runningProcs");
    }

}

/**
 * Remove DomainRule from runningProcs object
 * then update the browserAction badge with
 * the new count of running rules
 * if count is 0 remove the badge (by setting it to empty string)
 *
 * @param oRule DomainRule object
 */
var removeRunningRule = function (oRule) {
    var counter;

    if (null === oRule || (typeof oRule !== 'object')) {
        throw Error("removeRunningRule parameter must be instance of DomainRule");
    }

    removeRunningRuleById(oRule.id);

    counter = runningProcs.size();
    if (counter < 1) {
        counter = "";
    }

    chrome.browserAction.setBadgeText({text: counter.toString()});
}

var removeRunningRuleByHash = function (hash) {
    if (null === hash || (typeof hash !== 'string')) {
        throw new Error("hash param passed to removeRunningRuleByHash was not a string. :: " + (typeof hash));
    }

    if (runningProcs.hashMap.hasOwnProperty(hash)) {
        delete(runningProcs.hashMap[hash]);
    }

    counter = runningProcs.size();
    if (counter < 1) {
        counter = "";
    }

    chrome.browserAction.setBadgeText({text: counter.toString()});
}

/**
 * Remove rule from runningProcs by value of DomainRule id
 * @param string id
 */
var removeRunningRuleById = function (id) {
    var found = false, p;

    if (null === id || (typeof id !== 'string')) {
        throw new Error("id param passed to removeRunningRuleById was not a string. :: " + (typeof id));
    }

    for (p in runningProcs.hashMap) {
        if (runningProcs.hashMap.hasOwnProperty(p)) {

            if (id === runningProcs.hashMap[p].rule.id) {
                console.log("Found RunningRule with id: " + runningProcs.hashMap[p].rule.ruleName);
                found = p;
            }
        }
    }

    if (found) {
        delete(runningProcs.hashMap[found]);
    }

    counter = runningProcs.size();
    if (counter < 1) {
        counter = "";
    }

    chrome.browserAction.setBadgeText({text: counter.toString()});
}


/**
 * Update counter of RunningRule for this rule
 * and latestTime
 *
 * @param oRule DomainRule object
 * @param details
 */
var updateCallInProgress = function (oRule, details) {

    var p, runningRule;

    if (null === oRule || (typeof oRule !== 'object')) {
        throw Error("First param passed to updateCallInProgress must be instance of DomainRule");
    }

    for (p in runningProcs.hashMap) {
        if (runningProcs.hashMap.hasOwnProperty(p)) {

            if (oRule.id === runningProcs.hashMap[p].rule.id) {
                runningRule = runningProcs.hashMap[p];
            }
        }
    }

    if (runningRule) {
        d("Updating running rule: " + runningRule.rule.ruleName);
        runningRule.incrementCounter();
    }
}


/**
 * Schedule a rule to run later
 * After the interval number of minutes if the rule
 * is still in runningProcs object the loopUri
 * of the rule will be requested via ajax call
 *
 * @param rule
 */
var scheduleRule = function (rule) {
    d("starting scheduleRule()");
    var id = rule.id;

    d("WILL START rule: " + rule.ruleName + " id: " + id + " IN " + rule.getInterval() + " minute(s)");
    setTimeout(function () {
        var reqObj, hName, hVal, uri, myrule = runningProcs.getRuleById(id);
        if (myrule) {
            uri = myrule.getLoopUri();
            d("RULE for " + uri + " IS STILL IN PROGRESS");
            reqObj = {url: uri}
            if (myrule.extraHeader && myrule.extraHeader.name) {
                console.log("Rule has extraHeader: " + JSON.stringify(myrule.extraHeader));
            }
            /**
             * If rule has extraHeader defined then send it in this background request
             */
            if (myrule.extraHeader && myrule.extraHeader.name && myrule.extraHeader.val) {
                hName = myrule.extraHeader.name;
                hVal = myrule.extraHeader.val;
                reqObj.headers = {}
                reqObj.headers[hName] = hVal;
            }

            console.log("reqObj: " + JSON.stringify(reqObj));
            /**
             * Can set  extra headers if defined in this rule...
             */
            $.ajax(reqObj).done(function () {
                d("success for rule " + myrule.ruleName);
            }).fail(function () {
                    d("error for rule " + myrule.ruleName);
                });
        } else {
            d("RULE for " + id + " IS NOT SCHEDULE TO RUN");
            /**
             *
             */
        }
        /**
         * Schedule this request to run
         * in number of seconds set in rule's interval
         * Rule's interval is set in minutes, we have to
         * convert it to milliseconds by multiplying by 60000
         */
    }, (rule.getInterval() * 60000))

}

/**
 * Find DomainRule in DOMAIN_RULES array
 * that matches the url
 * RuleMatches url is it matches either the trigger uri
 * or the loopUri
 *
 * @param url
 * @returns mixed false | object DomainRule
 */
var getDomainRuleForUri = function (url) {
    var ret = false;

    DOMAIN_RULES.forEach(function (o, i) {

        if (o.isUriMatch(url)) {
            d("Found url rule for url: " + url);
            ret = o;
        }
    })

    return ret;
}

/**
 * Listener callback function
 * executes when tab is closed
 * if there are any RunningRule associated with
 * the closed tab and also rule has option
 * to break loop on tab close then the rule
 * will be removed from runningProcs
 *
 * @param tabId
 */
var handleTabClose = function (tabId) {
    var rule = runningProcs.getDomainRuleByTabId(tabId);
    d("handling tabClose for tabId " + tabId);
    if (rule) {
        d("Got running rule for tab " + tabId);
        if (rule.breakOnTabClose) {
            d("Rule has breakOnTabClose option. Will remove this rule");
            removeRunningRule(rule);
        }
    } else {
        d("No rule for tabId " + tabId);
    }
}

/**
 * Get the object that represents opened popup window
 * (browserAction window)
 * If popup window not opened returns null
 *
 * This function is currently not used.
 *
 * @returns {*}
 */
var getPopupView = function () {
    views = chrome.extension.getViews();
    console.log("TOTAL VIEWS: " + views.length);
    for (var i = 0; i < views.length; i++) {
        view = views[i];
        myHref = view.location.href;
        console.log("View: " + view);
        console.log("View href: " + view.location.href);
        d("IS popup.html: " + myHref.endsWith("popup.html"));
        //View href: chrome-extension://gedhildfbncohbnfpolpiohkhmgccajo/popup.html
        if (myHref.endsWith("popup.html")) {
            return view;
            //view.document.getElementById("popup_ui_main").innerHTML = "<p>HELLO FROM BACKGROUND</p>";
            //view.showAlert("Hello from the background");
        }
    }

    return null;
}

/**
 * Initializer functions
 * Runs on browser load
 * can be called with true param
 * to reset chrome onHeadersReceived listener
 * @param reload
 */
var initbgpage = function (reload) {

    var j, stored = getStoredItem();

    if (stored && (typeof stored === 'object') && stored.length > 0) {
        d("Setting DOMAIN FULES from storage");
        for (j = 0; j < stored.length; j += 1) {
            DOMAIN_RULES.push(new DomainRule(stored[j]));
        }
    } else {
        d("NO DOMAIN RULES in storage");
    }

    runningProcs = new RunningRules();

    var requestListener = function (details) {

        var myHref, oUri, views, view, oRule, url = details.url;

        /**
         * Experimental injection of css and js
         */
        if (details.type == "main_frame" && details.tabId >= 0) {
            d("Request is from main_frame for url: " + url + " tabId: " + details.tabId);
            /**
             * @todo check if tabId exists in tabs, otherwise will get js error
             * if trying to inject into tab that does not exist
             */
            chrome.tabs.insertCSS(details.tabId, {file: "css/fg.css"});
            chrome.tabs.executeScript(details.tabId, {file: "js/fg.js", runAt: "document_idle"});
        }

        /**
         * Remove ccn cookie if request is mylog
         * this is to prevent overriding the CodeIgniter security csfr cookie by simply
         * looking at the logs
         */
        if (details.method === "GET" && details.type === "main_frame" && url.indexOf("public/mylog") !== -1) {
            d("request is mylog")
            removeCookie(details, "ccn");
        } else {
            oRule = getDomainRuleForUri(url);

            if (oRule) {

                /**
                 * If result matches rule
                 * then scheduleRule
                 * It will cause the same url to be called again
                 * If result does not match then call is failed -
                 * remove from CALLS_IN_PROGRESS
                 * and add to FAILED_CALLS
                 */
                d("\n\nRequest complete");
                d('url : ' + url);
                d('statusLine : ' + details.statusLine);
                d('method  : ' + details.method);
                d('type  : ' + details.type);
                /**
                 * tabid -1 when requested from backbround (no tab)
                 * can use this value to indicate that we should remove
                 * cookie because request is NOT from actual browser tab!
                 */
                d('tabId  : ' + details.tabId);

                d('responseHeaders: ' + printHeaders(details.responseHeaders));
                removeCacheHeaders(details);

                /**
                 * If call NOT from tab (from background script)
                 */
                if (details.tabId < 0) {
                    d("Result is from background process");
                    if (oRule.removeCookies && oRule.removeCookies.length > 0) {
                        oRule.removeCookies.forEach(function (o) {
                            removeCookie(details, o);
                        })
                    }

                    if (!isValidResponse(oRule, details)) {
                        d("Result is not valid. Will remove from scheduled calls");
                        removeRunningRule(oRule);
                    } else {
                        d("Result of background call for " + url + " was good. " + details.statusLine + " Will schedule it to run again")
                        /**
                         * Result of background call was valid.
                         * Update calls in progress with latest details
                         * and schedule this url to run again
                         */
                        updateCallInProgress(oRule, details);
                        scheduleRule(oRule);
                    }

                } else {
                    /**
                     * This was called from browser, initial call to uri
                     * that triggered the loop
                     * schedule it to run in background
                     */
                    d("Rule matches for url: " + url + ". requestInterval: " + oRule.requestInterval);

                    addToCallsInProgress(oRule, details.tabId);
                }

            } else {
                //d("NO RULE FOUND FOR url: " + url);
            }
        }

        return {responseHeaders: details.responseHeaders};
    };

    chrome.tabs.onActivated.addListener(function (o) {
        chrome.browserAction.setTitle({title: BADGE_TITLE})
        chrome.browserAction.setIcon({path: 'img/24/geek_zombie_24.png'});
    });
    if (reload) {
        chrome.webRequest.onHeadersReceived.removeListener(requestListener);
    }
    chrome.webRequest.onHeadersReceived.addListener(requestListener, {urls: ["<all_urls>"], types: ["main_frame", "xmlhttprequest"]}, ["responseHeaders", "blocking"]);
    chrome.tabs.onRemoved.addListener(handleTabClose);
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
}

/**
 * When the extension is installed
 * open new tab with settings
 */
chrome.runtime.onInstalled.addListener(function (details) {
    var thisVersion;
    if (details.reason == "install") {
        console.log("This is a first install!");
    } else if (details.reason == "update") {
        thisVersion = chrome.runtime.getManifest().version;
        console.log("Updated from " + details.previousVersion + " to " + thisVersion + " !");
    }
    chrome.tabs.create({url: "settings.html"});
});

/**
 * The content script will query this page
 * looking for object fgRule with ruleId and reloadVal values
 */
chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        var oRule;
        console.log("Received some message");
        if (sender.tab && request.getConfig && request.getConfig == "fgRule") {
            oRule = getForegroundRuleForUrl(sender.tab.url);
            if (oRule) {
                console.log("Foreground Rule for " + sender.tab.url + " found. " + oRule.ruleName);
                sendResponse({fgRule: { reloadVal: oRule.fgTimeout, ruleId: oRule.id}});
                updateForegroundRules(oRule, sender.tab.id);
            }
        }
    });

initbgpage();
