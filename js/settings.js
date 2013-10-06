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

/**
 * jBeep
 *
 * Play WAV beeps easily in javascript!
 * Tested on all popular browsers and works perfectly, including IE6.
 *
 * @date 10-19-2012
 * @license MIT
 * @author Everton (www.ultraduz.com.br)
 * @version 1.0
 * @params soundFile The .WAV sound path
 */


/**
 * Creates menu with rule names
 * as clickable items
 */
var loadRules = function () {

    var aRules = bgpage.DOMAIN_RULES;
    d("Loading rules " + aRules.length + " " + (typeof aRules));
    var s = "", o;
    if (aRules.length === 0) {
        d("No rules to show");
    } else {
        for (var i = 0; i < aRules.length; i += 1) {
            o = aRules[i];
            d("setting one rule ");
            d("Rule is DomainRule: " + (o instanceof bgpage.DomainRule));
            if ((typeof o === 'object') && o.id && o.ruleName) {

                s += '<a href="#" class="list-group-item" id="' + o.id + '">' + o.ruleName + '<span></span></a>';
            }
        }
    }

    $("#rules_list").html(s);
    if (aRules.length === 0) {
        setupNewRuleEditor();
    }
}


/**
 * Find DomainRule identified by ruleId in aRules array
 * @param string ruleId
 * @returns mixed null | object DomainRule
 */
var getRuleById = function (ruleId) {
    var i, ret = null, o;
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
        loadRules();
        clearEditor();
        setRuleActive(ruleId);
        $("#rule_id").val(rule.id);
        $("#rule_name").val(rule.ruleName);
        $("#trigger_uri").val(rule.uri);
        $("#loop_uri").val(rule.getLoopUri());
        $("#loop_interval").val(rule.getInterval());
        $("#loop_exit_tab").prop('checked', !!rule.breakOnTabClose);
        $("#loop_exit_200").prop('checked', !!(rule.rule && rule.rule.ruleType && (rule.rule.ruleType == 'httpCodeIs') && rule.rule.ruleValue == '200'));
        $("#reload_sound").prop('checked', !!rule.beepEnabled);
        // Foreground uri and timeout
        $("#fg_trigger_uri").val(rule.fgUri);
        $("#fg_interval").val(rule.fgTimeout);

        if (rule.removeCookies && rule.removeCookies.length > 0) {
            cookies = rule.removeCookies.join("\n");
        }
        if (rule.extraHeader && rule.extraHeader.name && rule.extraHeader.val) {
            $("#h_name").val(rule.extraHeader.name);
            $("#h_val").val(rule.extraHeader.val);
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

    var myTriggerUri,
        myuri,
        myloopuri,
        fguri,
        temp,
        sCookies = $.trim($("#cookie_ignore").val()),
        aCookies = [],
        hName = $.trim($("#h_name").val()),
        hVal = $.trim($("#h_val").val());

    console.log("hName: " + hName + " hVal: " + hVal);

    /**
     * Basic validation or urls
     * Urls must start with http:// or https://
     * If user forgets to add this prefix
     * throw Error.
     * @type {*}
     */
    myTriggerUri = $.trim($("#trigger_uri").val());
    fguri = $.trim($("#fg_trigger_uri").val());
    console.log("fguri: " + fguri);

    if (myTriggerUri.length === 0 && fguri.length === 0) {
        throw new Error('Please define at least one of these: <br><strong>Trigger Uri</strong><br>or <strong>Auto-Reload Url</strong> in the "Foreground Page Reload Rule" section');
    }

    if (myTriggerUri.length > 0) {
        myuri = parseUri(myTriggerUri);
        myloopuri = parseUri($("#loop_uri").val());
        d("uri in form: " + JSON.stringify(myuri));
        d("loopUri in form: " + JSON.stringify(myloopuri));
    }


    if (myuri && myuri['protocol'] !== "http" && myuri['protocol'] !== "https") {
        throw new Error("Invalid Trigger Url.\nUrl Must start with http:// or https://");
    }

    if (myloopuri && myloopuri['source'] !== "" && myloopuri['protocol'] !== "http" && myloopuri['protocol'] !== "https") {
        throw new Error("Invalid Background Request Url.\nUrl Must start with http:// or https://");
    }
    // End Validation

    this.id = $("#rule_id").val();
    this.ruleName = $("#rule_name").val();
    this.uri = $("#trigger_uri").val();

    this.loopUri = $("#loop_uri").val();
    this.requestInterval = $("#loop_interval").val();
    this.breakOnTabClose = $("#loop_exit_tab").is(':checked');
    this.beepEnabled = $("#reload_sound").is(':checked');
    this.removeCookies = null;
    this.extraHeader = null;


    if (fguri.length > 0) {
        this.fgUri = fguri;
    }

    this.fgTimeout = $("#fg_interval").val();
    if (this.fgTimeout.length > 0) {
        this.fgTimeout = parseInt(this.fgTimeout, 10);
    }


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

    if (hName.length > 0 && hVal.length > 0) {
        this.extraHeader = {name: hName, val: hVal}
    }
}

/**
 * Adds css class 'active' to the list rule in the list of rules
 * so that it will have diffident color
 * All other rules that may have been previously set as active
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

    d("settings 360");
    if ($("#new_rule_id").length < 1) {
        d("Adding new rules item to rules menu " + $("#rules_list").length);
        $("#rules_list").prepend('<a href="#" class="list-group-item active" id="new_rule_id">New Rule<span></span></a>');
    } else {
        d("new_rule_id already in the dom");
        setRuleActive('new_rule_id');
    }
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
    var jBeep, fbUrl, storeUrl, soundElem, oUri = parseUri(window.location.href), soundFile = chrome.extension.getURL("beep.wav");
    soundElem = document.createElement("audio");
    soundElem.setAttribute("src", soundFile);

    /**
     * Set url to chrome store 'rate/review' page using
     * id of this extension. Notice id is not hard-coded - it will
     * be the value of this extension id
     *
     */
    fbUrl = 'https://www.facebook.com/plugins/like.php?href={store_url}&amp;width=450&amp;height=35&amp;colorscheme=light&amp;layout=standard&amp;action=like&amp;show_faces=false&amp;send=false&amp;appId=203208779690064';
    storeUrl = 'https://chrome.google.com/webstore/detail/' + chrome.runtime.id;
    document.getElementById("rate_us").href = storeUrl + '/reviews';
    $("#twtr").attr('data-url', storeUrl).attr('data-counturl', storeUrl);
    fbUrl = fbUrl.replace('{store_url}', encodeURIComponent(storeUrl));
    console.log("fbUrl: " + fbUrl);
    $("#my_fb_if").attr('src', fbUrl);


    $("#save_rule").click(saveFormValues);
    $("#confirm_delete").click(function () {
        deleteRule();
        $('#myModal').modal('hide')
    });

    $("#create_rule").click(setupNewRuleEditor);

    $("#rules_list").delegate("a.list-group-item", "click", function () {
        var id = $(this).attr("id");
        $("#rule_form").removeClass("hidden");
        $("#no_rule").addClass("hidden");
        setupRuleEditor(id);
    });

    $("#sound_test").click(function () {
        soundElem.play();
    });

    loadRules();

    if (oUri && oUri['queryKey'] && oUri['queryKey']['id']) {
        $("#rule_form").removeClass("hidden");
        $("#no_rule").addClass("hidden");
        setupRuleEditor(oUri['queryKey']['id']);
    }
})



