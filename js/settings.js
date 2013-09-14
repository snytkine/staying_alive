/**
 * Created with JetBrains PhpStorm.
 * User: admin
 * Date: 9/11/13
 * Time: 6:53 PM
 * To change this template use File | Settings | File Templates.
 */


$(function () {

    var aRules = [], bgpage = chrome && chrome.extension && chrome.extension.getBackgroundPage();

    if (bgpage) {
        d("Background page loaded");
        d("Count of DOMAIN_RULES: " + bgpage.DOMAIN_RULES.length);
        aRules = bgpage.DOMAIN_RULES;

    } else {
        d("NO Background page");
    }

    var hideSaved = function () {
        $("#saved_confirm").fadeOut('slow', function () {
        });
    }

    var showSaved = function () {
        $("#saved_confirm").fadeIn('fast', function () {
            setTimeout(hideSaved, 2000);
        })
    }

    var loadRules = function () {
        var s = "";
        aRules.forEach(function (o) {
            s += '<a href="#" class="list-group-item" id="' + o.id + '">' + o.ruleName + '</a>';
        })

        $("#rules_list").html(s);
    }

    /**
     * Find DomainRule identified by ruleId in aRules array
     * @param string ruleId
     * @returns mixed null | object DomainRule
     */
    var getRuleById = function (ruleId) {
        var ret;
        aRules.forEach(function (o) {
            if (o.id === ruleId) {
                ret = o;
            }
        })

        if (ret) {
            d("Found rule by id: " + ruleId + " ruleName: " + ret.ruleName);
        }
        return ret;
    }

    /**
     * Reset Rule Editor form to set all inputs to empty values
     */
    var clearEditor = function () {
        $("input").val("");
        $("textarea").val("");
        $("input:checkbox").prop('checked', false);
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


    var setRuleActive = function (ruleId) {
        d("Setting active ruleId: " + ruleId);
        /**
         * There can only be one active rule, so clear
         * any other active classes first
         */
        $("a.list-group-item").removeClass("active");
        $("#" + ruleId).addClass("active");
    }


    $("#save_rule").click(showSaved);
    $("#create_rule").click(function(){
        $("#rule_form").removeClass("hidden");
        clearEditor();
    })

    $("#rules_list").delegate("a.list-group-item", "click", function () {
        var id = $(this).attr("id");
        setupRuleEditor(id);
    });


    loadRules();
})

