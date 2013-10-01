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

var DOMAIN_RULES = [], foregroundRules = {}, runningProcs = new RunningRules();

/**
 * Send the message to content script that is running
 * in the specified tab. Message will contain object
 * {stopRule: ruleId}
 *
 * The listener in the content script will then
 * hides reload countdown and will prevent
 * any reloads that may already been scheduled;
 *
 * @param tabId
 */
var cancelContentScript = function (tabId, ruleId) {
    if (typeof tabId !== 'number') {
        throw new Error("cancelContentScript tabId param must be a number");
    }

    /*if (typeof ruleId !== 'number') {
     throw new Error("cancelContentScript ruleId param must be a number");
     }*/

    console.log("cancelContentScript() for tabId " + tabId + " ruleId: " + ruleId);

    /**
     * Make sure tab with this tabId exists, otherwise
     * we will get JavaScript error when trying to send message to
     * non-existent tab
     */
    chrome.tabs.get(tabId, function (oTab) {

            if (oTab && oTab.id) {
                d("cancelContentScript :: Sending stopRule message to tab " + tabId);
                chrome.tabs.sendMessage(tabId, {stopRule: ruleId});
            } else {
                colsole.log("cancelContentScript tab with id " + tabId + " does not exist");
            }
        }
    );
}

/**
 * Get number of rules in foregroundRules object
 * This function is called from popup.js
 *
 * @returns int
 */
var getForegroundRulesCount = function () {
    var i = 0;
    for (var p in foregroundRules) {
        if (foregroundRules.hasOwnProperty(p)) {
            i += 1;
        }
    }

    return i;
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
        d("isValidResponse() http code in this response: " + httpCode);

        if (oRule.rule.ruleValue == httpCode) {
            ret = true;
        }
    }

    d("isValidResponse: " + ret);

    return ret;
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
 * If Rule is removed then also update browserAction
 *
 * @param tabId
 * @param changeInfo
 * @param tab
 */
var handleTabUpdate = function (tabId, changeInfo, tab) {
    /**
     * DomainRule object that is used for that tabId (if found)
     */
    var dr;

    d("handleTabUpdate::tabId " + tabId + " status: " + changeInfo.status + " url: " + changeInfo.url);
    d("handleTabUpdate::tabId: " + tab.id + " status: " + tab.status + " url: " + tab.url + " active: " + tab.active);

    if (changeInfo.status === 'loading' && changeInfo.url) {
        console.log("handleTabUpdate url in tab changed");
        dr = getForegroundRuleByTabId(tabId);
        /**
         * If new uri does not match dr's foreground rule then
         * remove foreground rule
         * otherwise this means that user just navigates inside the matching site
         *
         * If rule did not match then content script was not initialized
         * But what if the new uri in tab matched another foreground rule?
         * Then it will be added to foregroundRules for the same tabId
         * which is OK because the old rule with same tabId
         * will already be removed by them
         * since status 'loading' even is fired before the new content
         * script is injected
         */
        if (dr && !dr.isForegroundMatch(changeInfo.url)) {
            console.log("handleTabUpdate() new uri in tab does not match same rule anymore");
            removeForegroundRuleByTabId(tabId);
        }
    }
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
    }

    d("No foregroudn rules matched for " + uri);

    return null;
}

/**
 * Update the value of counter on browser badge
 */
var updateBrowserBadge = function () {
    var e, counter = 0;
    counter = runningProcs.size();
    for (e in foregroundRules) {
        if (foregroundRules.hasOwnProperty(e)) {
            counter += 1;
        }
    }

    if (counter < 1) {
        counter = "";
    } else {
        counter = counter.toString();
    }

    d("Counter of running rules: " + counter);

    chrome.browserAction.setBadgeText({text: counter});
}


/**
 * Updated foregroundRules object for a specific rule
 * if rule already in foregroundRules
 * or add new rule to foregroundRules
 * This function is called after the content script
 * sends a message asking to match the url against
 * foreground rule and only if we got a match
 *
 * @param rule
 * @param tabId
 */
var updateForegroundRules = function (rule, tabId, uri) {
    var id, fgRule;
    if (null === rule || (typeof rule !== 'object')) {
        throw Error("updateForegroundRules parameter must be instance of DomainRule");
    }

    id = rule.id;
    if (foregroundRules.hasOwnProperty(id)) {
        fgRule = foregroundRules[id];
        d("updateForegroundRules(). Rule is already running: " + rule.ruleName + " tabId: " + tabId);
        /**
         * Update uri property as it may have changed in this request
         * For example when user navigates on the same site
         * the uri will be different but the rule still the same
         * We will show the value of the uri in the popup window
         * as the url of the next reload
         *
         */
        fgRule.uri = uri;
        //fgRule.setNextReloadTime();
    } else {
        fgRule = new RunningForegroundRule(rule, tabId, uri);
        foregroundRules[id] = fgRule;
        d("updateForegroundRules(). Added foreground rule: " + rule.ruleName + " tabId: " + tabId + " called uri: " + uri);
        updateBrowserBadge();
    }
}

/**
 * Given the id of foreground rule
 * if it exists in foregroundRules object
 * get the tabId for the rule
 * delete object from foregroundRules,
 * call
 * then call updateBrowserBadge() because count has changed
 *
 * @param string id
 */
var removeForegroundRuleById = function (id) {
    console.log("removeForegroundRuleById() id: " + id);
    var tabId;
    if (foregroundRules.hasOwnProperty(id)) {
        d("removeForegroundRule for rule: " + foregroundRules[id]['rule']['ruleName']);

        tabId = foregroundRules[id]['tabId'];
        /**
         * hide browserAction icon for tab
         */
        delete(foregroundRules[id]);
        cancelContentScript(tabId, id);
    } else {
        d("removeForegroundRule Rule " + rule.ruleName + " is not in the foregroundRules");
    }
}

/**
 * Given a value of tabId find RunningForegroundRule
 * in foregroundRules object and remove rule from foregroundRules
 * This function will be called when tab is closed
 *
 * OR when tab is updated and the new url in tab
 * no longer matches the rule assigned to that tab
 * meaning user navigated away from the website that
 * matched the rule
 *
 * @param tabId
 */
var removeForegroundRuleByTabId = function (tabId) {
    var foundId;

    if (!tabId || (typeof tabId !== 'number')) {
        throw new Error("removeForegroundRuleByTabId tabId param must be a number");
    }

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
        updateBrowserBadge();
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
        updateBrowserBadge();
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
    updateBrowserBadge();
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

    d("removeRunningRuleById removing rule by id: " + id);
    if ("fg_" === id.substring(0, 3)) {
        /**
         * This is foreground rule
         * Find it in foregroundRules
         * if found remove it
         * and then post message to the rule's tab
         */
        removeForegroundRuleById(id.substring(3));
    } else {
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
            d("removeRunningRuleById rule " + id + " found and removed from runningProcs");
        }
    }

    updateBrowserBadge();
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
    d("handleTabClose() handling tabClose for tabId " + tabId);
    if (rule) {
        d("handleTabClose() Got background running rule for tab " + tabId);
        if (rule.breakOnTabClose) {
            d("Rule has breakOnTabClose option. Will remove this rule");
            removeRunningRule(rule);
        }
    } else {
        d("handleTabClose() No rule for tabId " + tabId);
    }

    /**
     * Find ForegroundRule by tabId
     * and remove it
     */
    removeForegroundRuleByTabId(tabId);
}

/**
 * Chrome calls inReplaced when user types in
 * uri in browser and that uri is already cached
 * Then Chrome just replaces the tab with a cached tab, often
 * while use still types in the uri in browser.
 *
 * @param addedTab
 * @param removedTab
 */
var handleTabReplaced = function (addedTab, removedTab) {
    /**
     * First remove background rule for removed tab
     * then forebroundRule
     */
    handleTabClose(removedTab);

    /**
     * @todo what to do with addedTab?
     *
     */
}

var handleTabDetached = function (tabId, detachInfo) {
    console.log("BG::handleTabDetached tabId: " + tabId + " oldWindow: " + detachInfo.oldWindowId);
    /**
     * @todo remove foregroundRule with this tabId
     *
     */
}

var handleTabAttached = function (tabId, attachInfo) {
    console.log("BG::handleTabAttached tabId: " + tabId + " newWindow: " + attachInfo.newWindowId);

    /**
     * @todo update foregroundRule? Maybe not necessary since rule will still send a message before reload
     * and that's when we will update the tabId with new tab
     *
     * @todo update background rule in runningProcs
     */
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

    /**
     * @todo
     * Later is the global "Keep System Awake" setting is ON then call one of these:
     * It will prevent system from going to sleep
     *
     * chrome.power.requestKeepAwake('system'); // display may be dimmed or off but system will be running
     * OR
     * chrome.power.requestKeepAwake('display'); // display is highest level - will keep display ON
     *
     */
    runningProcs = new RunningRules();
    foregroundRules = {};

    /**
     * This function is for injecting extra header/value into request headers
     * only for the foreground rule (page reload)
     * For background rules headers are injected using ajax library of jQuery
     *
     * This function is run onBeforeSendHeaders
     * so it will run after the requestListener already ran, which is good
     * because requestListener can remove foreground rule if tab no longer
     * has url if valid foreground rule.
     *
     * @param details
     * @returns {{requestHeaders: *}}
     */
    var headerInjector = function (details) {
        var fgRule, aHeaders = [], ret = {requestHeaders: details.requestHeaders};
        if (details.tabId >= 0) {
            /**
             * Find background rule by tabId
             * see if the details.url still match that rule
             * if yes then add header from the rule
             */
                //return{requestHeaders: addHeader(details.url, details.requestHeaders)}
            fgRule = getForegroundRuleByTabId(details.tabId);
            if (fgRule) {
                if (fgRule.isForegroundMatch(details.url)) {
                    if (fgRule.extraHeader && fgRule.extraHeader.name && fgRule.extraHeader.val) {
                        /**
                         * Add extra headers to array of all headers
                         * First copy all headers to a new array using splice() with no params
                         */
                        aHeaders = details.requestHeaders.slice();
                        aHeaders.push({name: fgRule.extraHeader.name, value: fgRule.extraHeader.val});
                        console.log("BGP::headerInjector added extra header to response. Response headers now: " + JSON.stringify(aHeaders));

                        ret = {requestHeaders: aHeaders};
                    }
                }
            } else {
                console.log("No foreground rule for tab id " + details.tabId + " No extra headers to inject");
            }

        }

        return ret;
    }

    /**
     *
     * @param details
     * @returns {{responseHeaders: *}}
     */
    var requestListener = function (details) {

        var myHref, oUri, views, view, fgRule, oRule, url = details.url;

        /**
         * Experimental injection of css and js
         */
        if (details.type == "main_frame" && details.tabId >= 0) {
            d("Request is from main_frame for url: " + url + " tabId: " + details.tabId);

            /**
             * Check if already have foreground rule in this tabId
             * and if rule suppose to exit on non-200 http response
             * and if http code is NOT 200 then remove the background rule
             * and DO NOT INJECT CSS/JS
             * This means that if original response is NOT 200 the foreground
             * rule will still be added but will at most me reloaded only once
             * use isValidResponse(rule, details) to check for http code match
             */
            fgRule = getForegroundRuleByTabId(details.tabId);
            if (fgRule) {
                /**
                 * For foreground requests removing cookies
                 * is a bad idea.
                 * If page is reloaded the user may still want to
                 * use the actual page - even after many reloads.
                 * If important cookies are removed it may prevent user from posting
                 * to the form on the page.
                 */
                console.log('statusLine : ' + details.statusLine);
                if (isValidResponse(fgRule, details)) {
                    /**
                     * Check if tabId exists in tabs, otherwise will get js error
                     * if trying to inject into tab that does not exist
                     */
                    chrome.tabs.get(details.tabId, function (oTab) {
                        if (oTab && oTab.id) {
                            chrome.tabs.insertCSS(details.tabId, {file: "css/fg.css"});
                            chrome.tabs.executeScript(details.tabId, {file: "js/fg.js", runAt: "document_idle"});
                        }
                    })
                } else {
                    console.log("Response is not valid response for the foreground rule " + fgRule.ruleName);
                    removeForegroundRuleByTabId(details.tabId);
                }
            } else {
                /**
                 * Foreground rule not found for tab
                 * Must inject the content script - this is just any regular url,
                 * it may match some foreground rule we may have.
                 * We inject content scripts into every page with the only
                 * exception above - if this is a reload of page for existing rule but
                 * response code did not match defined rule (usually not 200)
                 */
                chrome.tabs.get(details.tabId, function (oTab) {
                    if (oTab && oTab.id) {
                        chrome.tabs.insertCSS(details.tabId, {file: "css/fg.css"});
                        chrome.tabs.executeScript(details.tabId, {file: "js/fg.js", runAt: "document_idle"});
                    }
                })
            }
        }

        /**
         * Remove ccn cookie if request is mylog
         * this is to prevent overriding the CodeIgniter security csfr cookie by simply
         * looking at the logs.
         *
         * This is something that only makes sense to me. It's not necessary for general logic
         * of this extension, but I want to make it part of the extension so that it
         * always removes 'ccn' cookies for specific requests.
         * I need it so that this extension plays nice with our other project
         */
        if (details.method === "GET" && details.type === "main_frame" && url.indexOf("public/mylog") !== -1) {
            d("request is mylog")
            removeCookie(details, "ccn");
        } else {

            /**
             * This logic block in for background rule only
             */
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
                    d("BGP::Result is from background process");
                    if (oRule.removeCookies && oRule.removeCookies.length > 0) {
                        oRule.removeCookies.forEach(function (o) {
                            removeCookie(details, o);
                        })
                    }

                    if (!isValidResponse(oRule, details)) {
                        d("Result is not valid. Will remove from scheduled calls");
                        removeRunningRule(oRule);
                    } else {
                        d("BGP::Result of background call for " + url + " was good. " + details.statusLine + " Will schedule it to run again")
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
                    d("BGP::Rule matches for url: " + url + ". requestInterval: " + oRule.requestInterval);

                    addToCallsInProgress(oRule, details.tabId);
                }

            } else {
                //d("NO RULE FOUND FOR url: " + url);
            }
        }

        return {responseHeaders: details.responseHeaders};
    };

    if (reload) {
        chrome.webRequest.onHeadersReceived.removeListener(requestListener);
        chrome.webRequest.onBeforeSendHeaders.removeListener(headerInjector);
        chrome.tabs.onRemoved.removeListener(handleTabClose);
        chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    }

    chrome.webRequest.onHeadersReceived.addListener(requestListener, {urls: ["<all_urls>"], types: ["main_frame", "xmlhttprequest"]}, ["responseHeaders", "blocking"]);
    chrome.webRequest.onBeforeSendHeaders.addListener(headerInjector, {urls: ["<all_urls>"], types: ["main_frame"]}, ["requestHeaders", "blocking"]);
    //chrome.webRequest.onBeforeSendHeaders.addListener(requestListener, {urls:["<all_urls>"], types:oData[REQUEST_TYPES_KEY]}, ["requestHeaders", "blocking"]);
    chrome.tabs.onRemoved.addListener(handleTabClose);
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    chrome.tabs.onReplaced.addListener(handleTabReplaced);
    chrome.tabs.onDetached.addListener(handleTabDetached);
    chrome.tabs.onAttached.addListener(handleTabAttached);
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
        var oRule, fgId;
        console.log("Received some message in background page");
        if (sender.tab) {

            if (request.getConfig && request.getConfig == "fgRule") {
                oRule = getForegroundRuleForUrl(sender.tab.url);
                if (oRule) {
                    console.log("Foreground Rule for " + sender.tab.url + " found. " + oRule.ruleName);
                    sendResponse({fgRule: { reloadVal: oRule.fgTimeout, ruleId: oRule.id}});
                    updateForegroundRules(oRule, sender.tab.id, sender.tab.url);
                }
            } else if (request.reloading) {
                console.log("BG received message about tab reloading for ruleID: " + request.reloading + " from tabId: " + sender.tab.id);
                fgId = request.reloading;
                if (foregroundRules.hasOwnProperty(fgId)) {
                    oRule = foregroundRules[fgId];
                    d("BG::Received message from content script about reload the page. Rule: " + oRule.rule.ruleName + " rule registered with tabId: " + oRule.tabId + " message sent from tab " + sender.tab.id);
                    /**
                     * @todo see if tabId passed in message is different from the one registered in RunningForegroundRule
                     * If it is different then update RunningForegroundRule with new tabId
                     * can just pass oRule.tabId to update() function
                     * with every call and to just update tabId of rule.
                     * This may be the case when tab was detached - the tabId will change then
                     * but the countdown to reload is still running in content script in tab so tab
                     * will send the message here. If we don't update tabId then we will have rule
                     * in foregroundRules with different tabId, so we will not be able to
                     * cancel rule properly.
                     */
                    oRule.update();
                    /**
                     * @todo this is a problem
                     * because we are setting nextReloadTime now
                     * but then it make take some tme to reload the page
                     */
                        //oRule.setNextReloadTime();
                    sendResponse({updated: true});
                }
            } else if (request.updateTime && request.ruleId) {
                fgId = request.ruleId;
                if (foregroundRules.hasOwnProperty(fgId)) {
                    oRule = foregroundRules[fgId];
                    d("BG::Received message from content script about updating reload time. Rule: " + oRule.rule.ruleName + " reloadTime: " + request.updateTime);
                    oRule.setNextReloadTime(request.updateTime);
                    sendResponse({updated: true});
                }
            }
        }
    }
);

chrome.runtime.onSuspend.addListener(function () {
    console.log("Chrome shutting down.");
    /**
     * Remove all background rules
     * Remove all foreground rules
     * The quickest way to do this is to just reset
     * the foregroundRules to empty object
     * and runningProcs to new RunningRules object
     *
     * @todo
     * in the future save the foreground and background rules
     * to storage so that they can be restored
     * on next startup
     */
        //runningProcs = new RunningRules();
        //foregroundRules = {};
        //updateBrowserBadge();
        //chrome.tabs.onRemoved.removeListener(handleTabClose);
        //chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    console.log("Done onSuspend cleanup");

})

chrome.runtime.onSuspendCanceled.addListener(function () {
    console.log("onSuspedCancelled() re-initializing...");
    //initbgpage(true);
})

initbgpage();
