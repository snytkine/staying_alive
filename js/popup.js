/**
 * Created with JetBrains PhpStorm.
 * User: snytkind
 * Date: 8/30/13
 * Time: 9:33 AM
 * To change this template use File | Settings | File Templates.
 */


var bgpage = chrome.extension.getBackgroundPage();
var result = bgpage.runningProcs.size();

var showAlert = function (s) {
    var tpl = '<div class="alert alert-danger">' + s + '</div>';
    $("#popup_ui_main").html(tpl);
}

var showProcs = function (procs) {
    console.log("WILL SHOW running procs");
    console.log("TOTAL RUNNING PROCS: " + procs.size());


    var template = $("#show_running").html();
    var tpl_end = $("#end_template").html();
    /**
     * RunningRule
     */
    var rr;
    /**
     * DomainRule
     */
    var dr;

    for (var p in procs.hashMap) {
        if (procs.hashMap.hasOwnProperty(p)) {
            rr = procs.hashMap[p]
            dr = rr['rule'];
            template += '<tr>';
            template += '<td><span class="rule_name" rel="tooltip" data-toggle="tooltip" title="' + dr.getLoopUri() + '">' + dr.ruleName + '</span></td>';
            template += '<td>' + dr.getLoopUri() + '</td>';
            template += '<td><span class="counter">538</span></td>';
            template += '<td><button type="button" rel="tooltip" data-toggle="tooltip" title="Cancel rule" class="cancel_rule" rule_id="' + p + '" >';
            template += '<span></span></button></td></tr>';
        }
    }


    $("#popup_ui_main").html(template + tpl_end);
    $().tooltip();
}

var updatePopup = function (runningProcs, domainRules) {
    if (domainRules.length < 1) {
        showAlert("You have not setup any rules for running background processes. Click on the Settings link above to add new rules");
        return;
    }

    if (runningProcs.size() < 1) {
        showAlert("There are no background requests running at this time. Click on Settings button above to view or add background rules");

        return;
    }

    showProcs(runningProcs);
}

$(function () {
    console.log("POPUP INITIALIZED");
    updatePopup(bgpage.runningProcs, bgpage.DOMAIN_RULES);
    $('body').tooltip({
        selector: '[rel=tooltip]'
    });

    $("#pop_close").click(function () {
        window.close()
    });


    $( "#popup_ui_main" ).delegate( "button.cancel_rule", "click", function() {
        var hash = $( this ).attr( "rule_id" );
        console.log("Cancelling rule " + hash);
        bgpage.removeRullingRuleByHash(hash);
        updatePopup(bgpage.runningProcs, bgpage.DOMAIN_RULES);
    });


})


console.log("num procs: " + result);
