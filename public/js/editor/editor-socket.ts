/**
 * Created by Derwish (derwish.pro@gmail.com) on 02.07.2016.
 */

import {Nodes, Node, Link} from "../../nodes/nodes"
import {NodesEngine, engine} from "../../nodes/nodes-engine";
import {editor} from "./node-editor";
import Utils from "../../nodes/utils";


export class EditorSocket {

    socketConnected: boolean;
    socket: SocketIOClient.Socket;
    engine: NodesEngine;


    constructor() {

        this.engine = engine;

        let socket = io();
        this.socket = socket;

        // socket.emit('chat message', "h1");

        //
        // socket.on('connect', function () {
        //     //todo socket.join(editor.renderer.engine.container_id);
        //
        //     if (this.socketConnected == false) {
        //         noty({text: 'Connected to web server.', type: 'alert'});
        //         //waiting while server initialized and read db
        //         setTimeout(function () {
        //             this.getNodes();
        //             this.getGatewayInfo();
        //             $("#main").fadeIn(300);
        //         }, 2000);
        //     }
        //     this.socketConnected = true;
        // });
        //
        // socket.on('disconnect', function () {
        //     $("#main").fadeOut(300);
        //     noty({text: 'Web server is not responding!', type: 'error'});
        //     this.socketConnected = false;
        // });


        socket.on('node-create', function (n) {
            let container = NodesEngine.containers[n.cid];
            let newNode = Nodes.createNode(n.type);
            newNode.pos = n.pos;
            //newNode.configure(n);
            container.add(newNode);
            container.setDirtyCanvas(true, true);
        });

        socket.on('node-delete', function (n) {
            let container = NodesEngine.containers[n.cid];
            let node = container.getNodeById(n.id);
            container.remove(node);
            container.setDirtyCanvas(true, true);

            //if current container removed
            // if (n.id == editor.renderer.engine.container_id) {
            //     (<any>window).location = "/editor/";
            // }
        });


        socket.on('nodes-delete', function (data) {
            let container = NodesEngine.containers[data.cid];
            for (let id of data.nodes) {
                let node = container.getNodeById(id);
                container.remove(node);
            }

            container.setDirtyCanvas(true, true);
        });

        socket.on('node-update-position', function (n) {
            let container = NodesEngine.containers[n.cid];

            let node = container.getNodeById(n.id);
            if (node.pos != n.pos) {
                node.pos = n.pos;
                node.setDirtyCanvas(true, true);
            }
        });

        socket.on('node-update-size', function (n) {
            let container = NodesEngine.containers[n.cid];
            let node = container.getNodeById(n.id);
            if (node.pos != n.pos) {
                node.size = n.size;
                node.setDirtyCanvas(true, true);
            }
        });

        socket.on('node-message-to-front-side', function (n) {
            let container = NodesEngine.containers[n.cid];
            let node = container.getNodeById(n.id);
            if (node.onGetMessageFromBackSide)
                node.onGetMessageFromBackSide(n.value);
        });


        socket.on('link-delete', function (l) {
            let container = NodesEngine.containers[l.cid];
            let link = container.links[l.id];

            let node = container.getNodeById(link.origin_id);
            let targetNode = container.getNodeById(link.target_id);
            node.disconnectOutput(link.origin_slot, targetNode);
            //targetNode.disconnectInput(link.target_slot);
        });

        socket.on('link-create', function (l) {
            let container = NodesEngine.containers[l.cid];
            let node = container.getNodeById(l.origin_id);
            let targetNode = container.getNodeById(l.target_id);

            // node.disconnectOutput(l.origin_slot, targetNode);
            // targetNode.disconnectInput(l.target_slot);

            node.connect(l.origin_slot, targetNode, l.target_slot);

            container.change();
        });

        socket.on('nodes-active', function (data) {
            let container = NodesEngine.containers[data.cid];
            for (let id of data.ids) {
                let node = container.getNodeById(id);
                if (node == null)
                    return;

                node.boxcolor = Nodes.options.NODE_ACTIVE_BOXCOLOR;
                node.setDirtyCanvas(true, true);
                setTimeout(function () {
                    node.boxcolor = Nodes.options.NODE_DEFAULT_BOXCOLOR;
                    node.setDirtyCanvas(true, true);
                }, 100);
            }
        });

        // socket.on('gateway-connected', function () {
        //     noty({text: 'Gateway connected.', type: 'alert', timeout: false});
        // });
        //
        // socket.on('gateway-disconnected', function () {
        //     noty({text: 'Gateway disconnected!', type: 'error', timeout: false});
        // });


        // this.getGatewayInfo();


        $("#sendButton").click(
            function () {
                //console.log(engine);
                let gr = JSON.stringify(this.engine.serialize());
                $.ajax({
                    url: '/api/editor/graph',
                    type: 'POST',
                    data: {json: gr.toString()}
                }).done(function () {

                });
            }
        );


    }

    //
    // getGatewayInfo(): void {
    //     $.ajax({
    //         url: "/api/mysensors/gateway/",
    //         success: function (gatewayInfo) {
    //             if (gatewayInfo.state == 1 || gatewayInfo.state == 2) {
    //                 noty({text: 'Gateway is not connected!', type: 'error', timeout: false});
    //             }
    //         }
    //     });
    // }


    getNodes(): void {
        $.ajax({
            url: "/api/editor/c/" + editor.renderer.engine.container_id,
            success: function (nodes) {
                engine.configure(nodes, false)
            }
        });
    }


    sendCreateNode(type: string, position: [number, number]): void {
        let json = JSON.stringify({type: type, position: position, container: editor.renderer.engine.container_id});
        $.ajax({
            url: "/api/editor/c/" + editor.renderer.engine.container_id + "/n/",
            contentType: 'application/json',
            type: 'POST',
            data: json
        })
    };


    sendRemoveNode(node: Node): void {
        $.ajax({
            url: "/api/editor/c/" + editor.renderer.engine.container_id + "/n/" + node.id,
            type: 'DELETE'
        })
    };


    sendRemoveNodes(nodes: {[id: number]: Node}): void {
        let ids = [];
        for (let n in nodes) {
            ids.push(n);
        }

        $.ajax({
            url: "/api/editor/c/" + editor.renderer.engine.container_id + "/n/",
            type: 'DELETE',
            contentType: 'application/json',
            data: JSON.stringify(ids)
        })
    };

    sendUpdateNodePosition(node: Node): void {
        $.ajax({
            url: `/api/editor/c/${editor.renderer.engine.container_id}/n/${node.id}/position`,
            contentType: 'application/json',
            type: 'PUT',
            data: JSON.stringify({position: node.pos})
        })
    };

    sendUpdateNodeSize(node: Node): void {
        $.ajax({
            url: `/api/editor/c/${editor.renderer.engine.container_id}/n/${node.id}/size`,
            contentType: 'application/json',
            type: 'PUT',
            data: JSON.stringify({size: node.size})
        })
    };


    sendCreateLink(origin_id: number, origin_slot: number, target_id: number, target_slot): void {
        let data = {
            origin_id: origin_id,
            origin_slot: origin_slot,
            target_id: target_id,
            target_slot: target_slot,
        };

        $.ajax({
            url: "/api/editor/c/" + editor.renderer.engine.container_id + "/l/",
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(data)
        });
    };


    sendRemoveLink(link: Link): void {
        $.ajax({
            url: "/api/editor/c/" + editor.renderer.engine.container_id + "/l/" + link.id,
            type: 'DELETE'
        })
    };

    //---------------------------------------------------


    sendCloneNode(node: Node): void {
        $.ajax({
            url: '/api/editor/nodes/clone',
            type: 'POST',
            data: {'id': node.id}
        }).done(function () {

        });
    };


    getGraph(): void {

        $.ajax({
            url: "/api/editor/graph",
            success: function (graph) {
                this.engine.configure(graph);
            }
        });
    }


    onReturnNodes(nodes: Array<Node>): void {
        if (!nodes) return;

        console.log(nodes);

        for (let i = 0; i < nodes.length; i++) {
            this.createOrUpdateNode(nodes[i]);
        }

        this.getLinks();
    }


    createOrUpdateNode(node: Node): void {

        let oldNode = this.engine.getNodeById(node.id);
        if (!oldNode) {
            //create new
            let newNode = Nodes.createNode(node.type);

            if (newNode == null) {
                console.error("Can`t create node of type: [" + node.type + "]");
                return;
            }

            newNode.title = node.title;

            newNode.inputs = node.inputs;
            newNode.outputs = node.outputs;
            newNode.id = node.id;
            newNode.properties = node.properties;

            //calculate size
            if (node.size)
                newNode.size = node.size;
            else
                newNode.size = newNode.computeSize();

            newNode.size[1] = this.calculateNodeMinHeight(newNode);

            //calculate pos
            if (node.pos)
                newNode.pos = node.pos;
            else
                newNode.pos = [Nodes.options.START_POS, this.findFreeSpaceY(newNode)];

            this.engine.add(newNode);
        } else {
            //update
            oldNode.title = node.title;

            if (node.properties['name'] != null)
                oldNode.title += " [" + node.properties['name'] + "]";

            if (node.properties['container-name'] != null)
                oldNode.title = node.properties['container-name'];

            oldNode.inputs = node.inputs;
            oldNode.outputs = node.outputs;
            oldNode.id = node.id;
            oldNode.properties = node.properties;

            //calculate size
            if (node.size)
                oldNode.size = node.size;
            else
                oldNode.size = oldNode.computeSize();

            oldNode.size[1] = this.calculateNodeMinHeight(oldNode);

            //calculate pos

            if (node.pos) {
                if (!editor.renderer.node_dragged)
                    oldNode.pos = node.pos;
                else if (!editor.renderer.selected_nodes[node.id])
                    oldNode.pos = node.pos;
            }

            oldNode.setDirtyCanvas(true, true);
        }
    }


    getLinks(): void {

        $.ajax({
            url: "/api/editor/links/" + editor.renderer.engine.container_id,
            success: function (links) {
                this.onReturnLinks(links);
            }
        });
    }


    onReturnLinks(links: Array<any>): void {
        //console.log(nodes);

        if (!links) return;

        for (let i = 0; i < links.length; i++) {
            this.createOrUpdateLink(links[i]);
        }
    }


    createOrUpdateLink(link: any): void {
        let target = this.engine.getNodeById(link.target_id);
        this.engine.getNodeById(link.origin_id)
            .connect(link.origin_slot, target, link.target_slot);

        // .connect(link.origin_slot, target, link.target_slot, link.id);
    }


    calculateNodeMinHeight(node: Node): number {

        let slotsMax = (node.outputs.length > node.inputs.length) ? node.outputs.length : node.inputs.length;
        if (slotsMax == 0)
            slotsMax = 1;

        let height = Nodes.options.NODE_SLOT_HEIGHT * slotsMax;

        return height + 5;
    }


    findFreeSpaceY(node: Node): number {


        let nodes = this.engine._nodes;


        node.pos = [0, 0];

        let result = Nodes.options.START_POS;


        for (let i = 0; i < nodes.length; i++) {
            let needFromY = result;
            let needToY = result + node.size[1];

            if (node.id == nodes[i].id)
                continue;

            if (!nodes[i].pos)
                continue;

            if (nodes[i].pos[0] > Nodes.options.NODE_WIDTH + 20 + Nodes.options.START_POS)
                continue;

            let occupyFromY = nodes[i].pos[1] - Nodes.options.FREE_SPACE_UNDER;
            let occupyToY = nodes[i].pos[1] + nodes[i].size[1];

            if (occupyFromY <= needToY && occupyToY >= needFromY) {
                result = occupyToY + Nodes.options.FREE_SPACE_UNDER;
                i = -1;
            }
        }

        return result;

    }
}

export let socket = new EditorSocket();