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
 * @todo add ability to add extra headers for background requests
 * By default remove X-Requested-With using some option in jQ (looks like it's not set anyway when using $.get() way...)
 */

var runningProcs, iconImg, oData = {}, DOMAIN_RULES = [];

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
        if (v.name == "Set-Cookie" && v.value.indexOf(name) !== -1) {
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
        if (v.name == "Expires" || v.name == "Last-Modified" || v.name == "Cache-Control" || v.name == "Etag") {
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
    if (runningProcs.hasRule(oRule) && !fromTabId) {
        d("There is  already the same rule in RunningProcs");
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

    runningProcs.removeRule(oRule);

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
 * Update counter of RunningRule for this rule
 * and latestTime
 *
 * @param oRule DomainRule object
 * @param details
 */
var updateCallInProgress = function (oRule, details) {

    if (null === oRule || (typeof oRule !== 'object')) {
        throw Error("First param passed to updateCallInProgress must be instance of DomainRule");
    }

    var runningRule, hash = oRule.hashCode();
    runningRule = runningProcs.getRule(hash);
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
    d("309 in scheduleRule()");
    var hash = rule.hashCode();

    d("WILL START rule: " + hash + " IN " + rule.getInterval() + " minute(s)");
    setTimeout(function () {
        var uri, myrule = runningProcs.getRule(hash);
        if (myrule) {
            uri = myrule.rule.getLoopUri();
            d("RULE for " + uri + " IS STILL IN PROGRESS");
            /**
             * Can set  extra headers if defined in this rule...
             */
            $.ajax({
                url: uri
                //,headers: {"X-Test-Header": "test-value"}
            }).done(function () {
                    d("success");
                }).fail(function () {
                    d("error");
                });
        } else {
            d("RULE for " + hash + " IS NOT SCHEDULE TO RUN");
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
        d("Trying to match url: " + url + " for rule: " + o.ruleName);
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
    /*TEMP_RULES.forEach(function (o) {
     DOMAIN_RULES.push(new DomainRule(o));
     })*/

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

        var myHref, oUri, views, view, oRule, url = details.url.toLocaleLowerCase();

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
                // new
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
                    /**
                     * @todo in future release may inject reloader into html page
                     * Inject script into html
                     */
                        //chrome.tabs.executeScript(details.tabId, {
                        //    code: 'setTimeout(function () { console.log("reloading... " + window.location.href); /* location.reload(); */}, 10 * 1000)',
                        //    runAt: 'document_start'
                        //}, function(){
                        //    d("Injected script to page");
                        //});
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
}

initbgpage();
