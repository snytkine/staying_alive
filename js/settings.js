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


var aRules = [], bgpage = chrome && chrome.extension && chrome.extension.getBackgroundPage();
if (bgpage) {
    d("Background page loaded");
    d("Count of DOMAIN_RULES: " + bgpage.DOMAIN_RULES.length);

    aRules = bgpage.DOMAIN_RULES;

} else {
    d("NO Background page");
}


var loadRules = function () {
    var aRules = bgpage.DOMAIN_RULES;
    d("Loading rules " + aRules.length + " " + (typeof aRules));
    var s = "", o;
    for (var i = 0; i < aRules.length; i += 1) {
        o = aRules[i];
        d("setting one rule ");
        d("Rule is DomainRule: " + (o instanceof bgpage.DomainRule));
        if ((typeof o === 'object') && o.id && o.ruleName) {

            s += '<a href="#" class="list-group-item" id="' + o.id + '">' + o.ruleName + '</a>';
        }
    }

    $("#rules_list").html(s);
}


/**
 * Find DomainRule identified by ruleId in aRules array
 * @param string ruleId
 * @returns mixed null | object DomainRule
 */
var getRuleById = function (ruleId) {
    var i, ret, o;
    d("Looking for rule by id: " + ruleId);

    for (i = 0; i < aRules.length; i += 1) {
        o = aRules[i];
        if (o.id === ruleId) {
            ret = o;
        }
    }

    if (ret) {
        d("Found rule by id: " + ruleId + " ruleName: " + ret.ruleName);
    }
    return ret;
}

/**
 * Setup editor form with values
 * from the DomainRule identified by the passed ruleId
 * Also make the link for this rule active
 *
 * @param string ruleId
 */
var setupRuleEditor = function (ruleId) {
    var rule, cookies = "";
    d("Setting editor for rule " + ruleId);
    rule = getRuleById(ruleId);
    if (rule !== null) {

        clearEditor();
        setRuleActive(ruleId);
        $("#rule_id").val(rule.id);
        $("#rule_name").val(rule.ruleName);
        $("#trigger_uri").val(rule.uri);
        $("#loop_uri").val(rule.getLoopUri());
        $("#loop_interval").val(rule.getInterval());
        $("#loop_exit_tab").prop('checked', !!rule.breakOnTabClose);
        $("#loop_exit_200").prop('checked', !!(rule.rule && rule.rule.ruleType && (rule.rule.ruleType == 'httpCodeIs') && rule.rule.ruleValue == '200'));
        if (rule.removeCookies && rule.removeCookies.length > 0) {
            cookies = rule.removeCookies.join("\n");
        }
        $("#cookie_ignore").val(cookies);
    }
}

/**
 * Object of this type holds
 * values from the Settings form.
 *
 * @constructor
 */
var SettingsForm = function () {

    var myuri, myloopuri, temp, sCookies = $.trim($("#cookie_ignore").val()), aCookies = [];

    /**
     * Basic validation or urls
     * Urls must start with http:// or https://
     * If user forgets to add this prefix
     * throw Error.
     * @type {*}
     */
    myuri = parseUri($("#trigger_uri").val());
    myloopuri = parseUri($("#loop_uri").val());

    d("uri in form: " + JSON.stringify(myuri));
    d("loopUri in form: " + JSON.stringify(myloopuri));

    if (myuri['protocol'] !== "http" && myuri['protocol'] !== "https") {
        throw new Error("Invalid Trigger Url.\nUrl Must start with http:// or https://");
    }

    if (myloopuri['source'] !== "" && myloopuri['protocol'] !== "http" && myloopuri['protocol'] !== "https") {
        throw new Error("Invalid Background Request Url.\nUrl Must start with http:// or https://");
    }
    // End Validation

    this.id = $("#rule_id").val();
    this.ruleName = $("#rule_name").val();
    this.uri = $("#trigger_uri").val();

    this.loopUri = $("#loop_uri").val();
    this.requestInterval = $("#loop_interval").val();
    this.breakOnTabClose = $("#loop_exit_tab").is(':checked');
    this.removeCookies = null;

    if ($("#loop_exit_200").is(':checked')) {
        this.rule = {
            "ruleType": "httpCodeIs",
            "ruleValue": "200"
        }
    } else {
        this.rule = null;
    }

    if (sCookies.length > 0) {
        temp = sCookies.split("\n");
        if (temp.length > 0) {
            for (var i = 0; i < temp.length; i += 1) {
                aCookies.push($.trim(temp[i]));
            }
        }

        if (aCookies.length > 0) {
            this.removeCookies = aCookies;
        }
    }
}

/**
 * Adds css class 'active' to the list rule in the list of rules
 * so that it will have diffident color
 * All other rules that may have been previosly set as active
 * are reset to not active
 *
 * @param ruleId
 */
var setRuleActive = function (ruleId) {
    d("Setting active ruleId: " + ruleId);
    /**
     * There can only be one active rule, so clear
     * any other active classes first
     */
    $("a.list-group-item").removeClass("active");
    $("#" + ruleId).addClass("active");
}

/**
 * Slowly fade out the "Rule Saved" notice
 */
var hideSaved = function () {
    $("#saved_confirm").fadeOut('slow', function () {
    });
}

/**
 * Fade in "Rule Saved" notice,
 * show it for 2 seconds then fade it out.
 */
var showSaved = function (s) {
    $("#saved_confirm").text(s).fadeIn('fast', function () {
        setTimeout(hideSaved, 2000);
    })
}

/**
 * Find DomainRule by id
 * if exists update it
 * If does not exist create new DomainRule,
 * add to DOMAIN_RULES array
 *
 * Then persist DOMAIN_RULES array to storage
 */
var saveFormValues = function () {
    var aRules = bgpage.DOMAIN_RULES;
    var i, updated = false;
    d("Saving form");
    try {
        var oFormVals = new SettingsForm();
    } catch (e) {
        showAlert(e.message + "<br>Rule NOT Saved\n");
        return;
    }

    d("formVals: " + JSON.stringify(oFormVals));

    if (!oFormVals.id || oFormVals.ruleName.id < 1) {
        showAlert("Rule ID is Required<br>Rule NOT Saved");
        return;
    }
    /**
     * Validate required fields
     * @todo Show validation errors in a
     * better way than alert
     */
    if (!oFormVals.ruleName || oFormVals.ruleName.length < 1) {
        showAlert("Rule Name is Required<br>Rule NOT Saved");
        return;
    }

    if (!oFormVals.uri || oFormVals.uri.length < 10) {
        showAlert("Trigger Url is Required<br>Rule NOT Saved");
        return;
    }

    if (!oFormVals.uri || oFormVals.requestInterval.length < 1) {
        showAlert("Request Interval is Required<br>Rule NOT Saved");
        return;
    }

    for (i = 0; i < aRules.length; i += 1) {
        if (aRules[i].id === oFormVals.id) {
            d("Will update existing rule: " + aRules[i].ruleName);
            d("Hash before update: " + aRules[i].hashCode());
            aRules[i].update(oFormVals);
            d("Hash after update: " + aRules[i].hashCode());
            updated = true;
        }
    }

    if (!updated) {
        /**
         * Create new bgpage.DomainRule
         * Important to use bgpage.DomainRule and not just new DomainRule
         * because typeof check will treat these 2 differently!
         * using oFormVals as input object
         */
        d("Will add new Rule to DOMAIN_RULES");
        bgpage.DOMAIN_RULES.push(new bgpage.DomainRule(oFormVals));
        d("Number of rules now: " + bgpage.DOMAIN_RULES.length);
    }

    persist(bgpage.DOMAIN_RULES);
    /**
     * Re-render the editor form
     * because if Loop Url was unset during editing
     * the default value need to be reloaded
     *
     * Also if new rule was added need to add
     * new item to rules menu
     */
    loadRules();
    setupRuleEditor(oFormVals.id);

    showSaved("Rule Saved");
}

/**
 * Handle delete rule button click
 * Remove from runningProcs in case the rule
 * is one of the scheduled rules
 * Remove from array of DOMAIN_RULES
 * save new array to storage
 */
var deleteRule = function () {
    var aRules = bgpage.DOMAIN_RULES;
    var i, id, updated = false;
    id = $("#rule_id").val();
    d("Deleting Rule " + id);
    d("Number of rules before delete: " + bgpage.DOMAIN_RULES.length);
    for (i = 0; i < aRules.length; i += 1) {
        if (aRules[i].id === id) {
            bgpage.removeRunningRule(aRules[i]);
            bgpage.DOMAIN_RULES.splice(i, 1);
            break;
        }
    }

    persist(aRules);
    clearEditor();
    loadRules();
    $("#rule_form").addClass("hidden");
    $("#no_rule").removeClass("hidden");
}


/**
 * Reset Rule Editor form
 * to set all inputs to empty values
 */
var clearEditor = function () {
    $("input").val("");
    $("textarea").val("");
    $("input:checkbox").prop('checked', false);
}


/**
 * Setup the editor form to start adding new rule
 * Menu items are reset in case any of the item was
 * previously set to 'active'
 * Rule checkboxes are set to 'checked' by default
 * for the new rule
 */
var setupNewRuleEditor = function () {
    $("#rule_form").removeClass("hidden");
    $("#no_rule").addClass("hidden");
    clearEditor();
    /**
     * Must set the value of rule_id
     */
    $("#rule_id").val(makeId());
    /**
     * Set rule checkboxes checked
     * because these are preferred settings
     */
    $("input:checkbox").prop('checked', true);
    /**
     * Remove "active" class from any other rule
     * in the menu
     */
    $("a.list-group-item").removeClass("active");
}

/**
 * Show alert message inside modal window
 * @param string s string to show in alert
 * @param string title optional title
 */
var showAlert = function (s, title) {
    $("#alert_message").html(s);
    $("#alert_title").text(title || "Validation Error");
    $('#alertModal').modal('show')
}

/**
 * Run on page load.
 * Setup listeners for buttons and menu items
 */
$(function () {
    $("#save_rule").click(saveFormValues);
    $("#confirm_delete").click(function () {
        deleteRule();
        $('#myModal').modal('hide')
    });

    $("#create_rule").click(setupNewRuleEditor)

    $("#rules_list").delegate("a.list-group-item", "click", function () {
        var id = $(this).attr("id");
        $("#rule_form").removeClass("hidden");
        $("#no_rule").addClass("hidden");
        setupRuleEditor(id);
    });


    loadRules();
})

