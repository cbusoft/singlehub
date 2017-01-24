(function (factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        var v = factory(require, exports); if (v !== undefined) module.exports = v;
    }
    else if (typeof define === 'function' && define.amd) {
        define(["require", "exports", "../../nodes/nodes", "../../nodes/nodes-engine", "../../nodes/nodes/base", "../../nodes/nodes/math", "./litegraph-editor"], factory);
    }
})(function (require, exports) {
    "use strict";
    const nodes_1 = require("../../nodes/nodes");
    // import {LGraphCanvas} from "./litegraph-canvas"
    const nodes_engine_1 = require("../../nodes/nodes-engine");
    require("../../nodes/nodes/base");
    require("../../nodes/nodes/math");
    const litegraph_editor_1 = require("./litegraph-editor");
    window.graph = nodes_engine_1.nodesEngine;
    window.editor = litegraph_editor_1.editor;
    window.nodes = nodes_1.Nodes;
    window.addEventListener("resize", function () {
        litegraph_editor_1.editor.graphcanvas.resize();
    });
    //getNodes();
    let node_const_A = nodes_1.Nodes.createNode("basic/const");
    node_const_A.pos = [200, 200];
    nodes_engine_1.nodesEngine.add(node_const_A);
    node_const_A.setValue(5);
    let node_const_B = nodes_1.Nodes.createNode("basic/const");
    node_const_B.pos = [200, 300];
    nodes_engine_1.nodesEngine.add(node_const_B);
    node_const_B.setValue(10);
    let node_math = nodes_1.Nodes.createNode("math/operation");
    node_math.pos = [400, 200];
    node_math.properties.OP = "-";
    node_math.addOutput("A-B");
    nodes_engine_1.nodesEngine.add(node_math);
    let node_watch = nodes_1.Nodes.createNode("basic/console");
    node_watch.pos = [700, 200];
    nodes_engine_1.nodesEngine.add(node_watch);
    // let node_watch2 = nodes.createNode("basic/console");
    // node_watch2.pos = [700, 300];
    // nodesEngine.add(node_watch2);
    node_const_A.connect(0, node_math, 0);
    node_const_B.connect(0, node_math, 1);
    node_math.connect(0, node_watch, 0);
    // node_math.connect(0, node_watch2, 0);
    nodes_engine_1.nodesEngine.start(1000);
    // nodesEngine.runStep(1);
    //
    // setInterval(function () {
    //     nodesEngine.runStep(1);
    // }, 1000);
    console.log("ok");
});
//# sourceMappingURL=litegraph.js.map