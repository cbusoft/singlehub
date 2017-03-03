/**
 * Created by Derwish (derwish.pro@gmail.com) on 03.03.17.
 * License: http://www.gnu.org/licenses/gpl-3.0.txt
 */

declare let container_id: number;
declare let node_id: number;
declare let urlStart: any;
declare let urlEnd: any;
declare let autoScroll: string;
declare let charType: string;
declare let vis;
declare let moment;
declare let DataSet;


let clientsHub;
let signalRServerConnected;

let elementsFadeTime = 300;

let groups = new vis.DataSet();
groups.add({id: 0});
let DELAY = 1000; // delay in ms to add new data points
// create a graph2d with an (currently empty) dataset
let container = document.getElementById('visualization');
let dataset = new vis.DataSet();
let options;
let graph2d = new vis.Graph2d(container, dataset, groups, options);

//let node_id - initialized from ViewBag

//
// $(function () {
//
//     //configure signalr
//     let clientsHub = $.connection.dashboardHub;
//
//     clientsHub.client.OnGatewayConnected = function () {
//         noty({text: 'Gateway is connected.', type: 'alert', timeout: false});
//     };
//
//     clientsHub.client.OnGatewayDisconnected = function () {
//         noty({text: 'Gateway is disconnected!', type: 'error', timeout: false});
//     };
//
//
//     clientsHub.client.OnUiNodeUpdated = function (node) {
//         if (node.Id == node_id)
//             updateChart(node);
//     };
//
//     clientsHub.client.OnRemoveAllNodesAndLinks = function () {
//         noty({text: 'This Node was removed!', type: 'error', timeout: false});
//         $('#panelsContainer').empty();
//     };
//
//     clientsHub.client.OnRemoveUiNode = function (node) {
//         if (node.Id == node_id) {
//             noty({text: 'This Node was removed!', type: 'error', timeout: false});
//             $('#panelsContainer').empty();
//         }
//     };
//
//
//     $.connection.hub.start(
//         function () {
//             clientsHub.server.join(container_id);
//         });
//
//     $.connection.hub.stateChanged(function (change) {
//         if (change.newState === $.signalR.connectionState.reconnecting) {
//             noty({text: 'Web server is not responding!', type: 'error', timeout: false});
//             signalRServerConnected = false;
//         }
//         else if (change.newState === $.signalR.connectionState.connected) {
//             if (signalRServerConnected == false) {
//                 noty({text: 'Connected to web server.', type: 'alert', timeout: false});
//                 getNodes();
//                 getGatewayInfo();
//             }
//             signalRServerConnected = true;
//         }
//     });
//
//     // let connection = $.connection(clientsHub);
//     // connection.stateChanged(signalrConnectionStateChanged);
//     //connection.start({ waitForPageLoad: true });
//
// });


let lastChartData;

function updateChart(node) {
    $('.chartName').html(node.Name);

    if (node.LastRecord == null || lastChartData == node.LastRecord.x)
        return;

    addChartData(node.LastRecord, node.Settings.MaxRecords.Value);
}


function onAutoscrollChange() {
    autoScroll = (<any>$("#autoscroll")).dropdown('get value')[0];
}




function renderStep() {
    let now = vis.moment();
    let range = graph2d.getWindow();
    let interval = range.end - range.start;

    switch (autoScroll) {
        case 'continuous':
            graph2d.setWindow(now - interval, now, {animation: false});
            requestAnimationFrame(renderStep);
            break;
        case 'discrete':
            graph2d.setWindow(now - interval, now, {animation: false});
            setTimeout(renderStep, DELAY);
            break;
        case 'none':
            setTimeout(renderStep, DELAY);
            break;
        default: // 'static'
            // move the window 90% to the left when now is larger than the end of the window
            if (now > range.end) {
                graph2d.setWindow(now - 0.1 * interval, now + 0.9 * interval);
            }
            setTimeout(renderStep, DELAY);
            break;
    }
}


renderStep();

$(document).ready(function () {


    //Loading data frow server
    $.ajax({
        url: "/editor/c/"+container_id+"/n/"+node_id+"/log",
        success: function (chartData) {
            $('#infoPanel').hide();
            $('#chartPanel').fadeIn(elementsFadeTime);

            if (chartData != null) {
                setChartData(chartData);
            } else {
                showAll();
            }
            (<any>$("#charttype")).dropdown('set selected', charType);
            (<any>$("#autoscroll")).dropdown('set selected', autoScroll);
        },
        error: function () {
            $('#infoPanel').html("<p class='text-danger'>Failed to get data from server!</p>");
        }
    });

    updateCharType();
});


function setChartData(chartData) {
    dataset.add(chartData);

    lastChartData = chartData[chartData.length - 1].x;

    let start, end;

    if (dataset.length == 0) {
        start = vis.moment().add(-1, 'seconds');
        end = vis.moment().add(60, 'seconds');
    } else {
        start = vis.moment(dataset.min('x').x).add(-1, 'seconds');
        end = vis.moment(dataset.max('x').x).add(60 * 2, 'seconds');
    }

    if (range_start != "0")
        start = new Date(range_start);

    if (range_end != "0")
        end = new Date(range_end);
    else {
        end = new Date(new Date().getTime() + (10 * 60 * 1000));//now + 10 minutes
    }


    let options = {
        start: start,
        end: end
    };
    graph2d.setOptions(options);
}


function addChartData(chartData, maxRecords) {
    dataset.add(chartData);

    lastChartData = chartData.x;

    let unwanted = dataset.length - maxRecords;
    if (unwanted > 0) {
        let items = dataset.get();
        for (let i = 0; i < unwanted; i++) {
            dataset.remove(items[i]);
        }
    }
}


function onCharTypeChange() {
    charType = (<any>$("#charttype")).dropdown('get value')[0];
    updateCharType();

    $.ajax({
        url: "/DashboardAPI/SetValues/",
        type: "POST",
        data: {'node_id': node_id, 'values': {Style: charType}}
    });
}

function updateCharType() {
    switch (charType) {
        case 'bars':
            options = {
                height: '370px',
                style: 'bar',
                drawPoints: false,
                barChart: {width: 50, align: 'right', sideBySide: false}
            };
            break;
        case 'splines':
            options = {
                height: '370px',
                style: 'line',
                drawPoints: {style: 'circle', size: 6},
                shaded: {enabled: false},
                interpolation: {enabled: true}
            };
            break;
        case 'shadedsplines':
            options = {
                style: 'line',
                height: '370px',
                drawPoints: {style: 'circle', size: 6},
                shaded: {enabled: true, orientation: 'bottom'},
                interpolation: {enabled: true}
            };
            break;
        case 'lines':
            options = {
                height: '370px',
                style: 'line',
                drawPoints: {style: 'square', size: 6},
                shaded: {enabled: false},
                interpolation: {enabled: false}
            };
            break;
        case 'shadedlines':
            options = {
                height: '370px',
                style: 'line',
                drawPoints: {style: 'square', size: 6},
                shaded: {enabled: true, orientation: 'bottom'},
                interpolation: {enabled: false}
            };
            break;
        case 'dots':
            options = {
                height: '370px',
                style: 'points',
                drawPoints: {style: 'circle', size: 10}
            };
            break;
        default:
            break;
    }


    //setOptions cause a bug when switching to dots!!!
    graph2d.setOptions(options);
    //thats why we need redraw:
    //redrawChart(options);


}

function redrawChart(options) {
    let window = graph2d.getWindow();
    options.start = window.start;
    options.end = window.end;
    graph2d.destroy();
    graph2d = new vis.Graph2d(container, dataset, groups, options);
}


let zoomTimer;
function showNow() {

    clearTimeout(zoomTimer);
    (<any>$("#autoscroll")).dropdown('set selected', "none");
    let window = {
        start: vis.moment().add(-30, 'seconds'),
        end: vis.moment()
    };
    graph2d.setWindow(window);
    //timer needed for prevent zoomin freeze bug
    zoomTimer = setTimeout(function (parameters) {
        (<any>$("#autoscroll")).dropdown('set selected', "continuous");
    }, 1000);
}


function showAll() {
    clearTimeout(zoomTimer);
    (<any>$("#autoscroll")).dropdown('set selected', "none");
    //graph2d.fit();


    let start, end;

    if (dataset.length == 0) {
        start = vis.moment().add(-1, 'seconds');
        end = vis.moment().add(60, 'seconds');
    } else {
        let min = dataset.min('x');
        let max = dataset.max('x');
        start = vis.moment(min.x).add(-1, 'seconds');
        end = vis.moment(max.x).add(60 * 2, 'seconds');
    }

    let window = {
        start: start,
        end: end
    };
    graph2d.setWindow(window);
}


function share() {
    let url = $(location).attr('host') + $(location).attr('pathname');
    let start = graph2d.getWindow().start;
    let end = graph2d.getWindow().end;
    url += "?autoscroll=" + (<any>$("#autoscroll")).dropdown('get value')[0];
    url += "&style=" + (<any>$("#charttype")).dropdown('get value')[0];
    url += "&start=" + start.getTime();
    url += "&end=" + end.getTime();
    (<any>$('#shareModal')).modal('setting', 'transition', 'vertical flip').modal('show');
    $('#url').val(url);

}


$('#clear-button').click(function () {
    $.ajax({
        url: "/DashboardAPI/SetValues/",
        type: "POST",
        data: {'node_id': node_id, 'values': {Clear: "true"}},
        success: function () {
            dataset.clear();
        }
    });
});

$('#share-button').click(function () {
    share()
});