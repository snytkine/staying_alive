/**
 * Created with JetBrains PhpStorm.
 * User: admin
 * Date: 9/11/13
 * Time: 6:53 PM
 * To change this template use File | Settings | File Templates.
 */


$(function () {

    var hideSaved = function(){
        $("#saved_confirm").fadeOut('slow', function(){});
    }

    var showSaved = function(){
        $("#saved_confirm").fadeIn('fast', function(){
            setTimeout(hideSaved, 2000);
        })
    }


    $("#save_rule").click(showSaved)


})

