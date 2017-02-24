/**
 * Created by Derwish (derwish.pro@gmail.com) on 04.07.2016.
 */


import {Nodes} from "./nodes";
import {Node, SerializedNode} from "./node";
import {Renderer} from "../js/editor/renderer";
import Timer = NodeJS.Timer;
import {ContainerNode, ContainerInputNode, ContainerOutputNode} from "./nodes/main"
import {Database} from "../interfaces/database";
import Utils from "./utils";

//console logger back and front
let log;
declare let Logger: any; // tell the ts compiler global variable is defined
if (typeof (window) === 'undefined') //for backside only
    log = require('logplease').create('container', {color: 5});
else  //for frontside only
    log = Logger.create('container', {color: 5});


export interface SerializedContainer {
    id: number;
    last_node_id: number;
    config?: any;
    serialized_nodes?: Array<SerializedNode>;
}

export class Container {
    static containers: {[id: number]: Container} = {};
    static last_container_id: number = -1;

    parent_container_id?: number;
    container_node: ContainerNode;

    socket: SocketIOClient.Socket|SocketIO.Server;
    db: Database;

    _nodes: {[id: number]: Node} = {};

    id: number;
    supported_types = ["number", "string", "boolean"];
    list_of_renderers: Array<Renderer>;
    isRunning: boolean;
    last_node_id: number;
    iteration: number;
    config: {
        align_to_grid?: boolean;
        links_ontop?: boolean;
    };
    globaltime: number;
    runningtime: number;
    fixedtime: number;
    fixedtime_lapse: number;
    elapsed_time: number;
    starttime: number;
    execution_timer_id: Timer;
    errors_in_execution: boolean;

    onStopEvent: Function;
    on_change: Function;
    onNodeAdded: Function;
    onExecuteStep: Function;
    onAfterExecute: Function;
    onConnectionChange: Function;
    onNodeRemoved: Function;
    onPlayEvent: Function;
    frame: number;


    constructor(id?: number) {
        this.list_of_renderers = null;

        this.id = id || ++Container.last_container_id;

        Container.containers[this.id] = this;
        this.clear();

        log.debug("Container created [" + this.id + "]");

        let rootContainer = Container.containers[0];
        if (rootContainer) {
            if (rootContainer.socket)
                this.socket = rootContainer.socket;

            if (rootContainer.db)
                this.db = rootContainer.db;
        }
    }


//used to know which types of connections support this container (some containers do not allow certain types)
    getSupportedTypes(): Array<string> {
        return this.supported_types;
    }


    /**
     * Removes all nodes from this container
     */
    clear(): void {
        this.stop();
        this.isRunning = false;
        this.last_node_id = 0;

        //nodes
        this._nodes = {};

        //iterations
        this.iteration = 0;

        this.config = {};

        //timing
        this.globaltime = 0;
        this.runningtime = 0;
        this.fixedtime = 0;
        this.fixedtime_lapse = 0.01;
        this.elapsed_time = 0.01;
        this.starttime = 0;


        // this.setDirtyCanvas(true, true);

        this.sendActionToRenderer("clear");
    }

    /**
     * Stops the execution loop of the container
     */
    stop(): void {
        if (!this.isRunning)
            return;

        this.isRunning = false;

        if (this.onStopEvent)
            this.onStopEvent();

        if (this.execution_timer_id != null)
            clearInterval(this.execution_timer_id);
        this.execution_timer_id = null;


        for (let id in this._nodes) {
            let node = this._nodes[id];
            if (node.onStopContainer)
                node.onStopContainer();
        }
    }


    /**
     * Attach Renderer to this container
     * @param renderer
     */
    attachRenderer(renderer: Renderer): void {
        if (renderer.container && renderer.container != this)
            renderer.container.detachRenderer(renderer);

        renderer.container = this;
        if (!this.list_of_renderers)
            this.list_of_renderers = [];
        this.list_of_renderers.push(renderer);
    }

    /**
     * Detach Renderer from this container
     * @param renderer
     */
    detachRenderer(renderer: Renderer): void {
        if (!this.list_of_renderers)
            return;

        let pos = this.list_of_renderers.indexOf(renderer);
        if (pos == -1)
            return;
        renderer.container = null;
        this.list_of_renderers.splice(pos, 1);
    }

    /**
     * Starts running this container every interval milliseconds.
     * @param interval amount of milliseconds between executions
     */
    run(interval: number = 1): void {
        if (this.isRunning)
            return;

        this.isRunning = true;

        if (this.onPlayEvent)
            this.onPlayEvent();

        for (let id in this._nodes) {
            let node = this._nodes[id];
            if (node.onRunContainer)
                node.onRunContainer();
        }


        //launch
        this.starttime = Utils.getTime();
        let that = this;

        this.execution_timer_id = setInterval(function () {
            //execute
            that.runStep(1);
        }, interval);
    }


    /**
     * Run N steps (cycles) of the container
     * @param steps number of steps to run, default is 1
     */
    runStep(steps: number = 1): void {
        let start = Utils.getTime();
        this.globaltime = 0.001 * (start - this.starttime);

        // try {
        for (let i = 0; i < steps; i++) {

            this.transferDataBetweenNodes();

            for (let id in this._nodes) {
                let node = this._nodes[id];
                if (node.onExecute)
                    node.onExecute();

                if (node.isUpdated) {
                    if (node.onInputUpdated)
                        node.onInputUpdated();

                    node.isUpdated = false;

                    for (let i in node.inputs)
                        if (node.inputs[i].updated)
                            node.inputs[i].updated = false;
                }
            }

            this.fixedtime += this.fixedtime_lapse;

            if (this.onExecuteStep)
                this.onExecuteStep();
        }

        if (this.onAfterExecute)
            this.onAfterExecute();

        // this.errors_in_execution = false;
        // }
        // catch (err) {
        //     this.errors_in_execution = true;
        //     log.error("Error during execution: " + err, this);
        //     this.stop();
        //     throw err;
        // }

        let elapsed = Utils.getTime() - start;
        if (elapsed == 0) elapsed = 1;
        this.elapsed_time = 0.001 * elapsed;
        this.globaltime += 0.001 * elapsed;
        this.iteration += 1;
    }


    transferDataBetweenNodes() {
        for (let id in this._nodes) {
            let node = this._nodes[id];
            if (!node.outputs)
                continue;

            for (let o in node.outputs) {
                let output = node.outputs[o];
                if (output.links == null)
                    continue;

                for (let link of output.links) {

                    let target_node = this._nodes[link.target_node_id];
                    if (!target_node) {
                        log.error("Can't transfer data from node " + node.getReadableId() + ". Target node not found");
                        continue;
                    }
                    let target_input = target_node.inputs[link.target_slot];

                    if (target_input.data !== output.data) {
                        target_input.data = output.data;
                        target_node.isUpdated = true;
                        target_input.updated = true;
                    }
                }
            }
        }


    }


    /**
     * Returns the amount of time the container has been running in milliseconds
     * @method getTime
     * @returns number of milliseconds the container has been running
     */
    getTime(): number {
        return this.globaltime;
    }

    /**
     * Returns the amount of time accumulated using the fixedtime_lapse var. This is used in context where the time increments should be constant
     * @method getFixedTime
     * @returns number of milliseconds the container has been running
     */
    getFixedTime(): number {
        return this.fixedtime;
    }

    /**
     * Returns the amount of time it took to compute the latest iteration. Take into account that this number could be not correct
     * if the nodes are using graphical actions
     * @method getElapsedTime
     * @returns number of milliseconds it took the last cycle
     */
    getElapsedTime(): number {
        return this.elapsed_time;
    }


    /**
     * Sends action to renderer
     * @param action
     * @param params
     */
    sendActionToRenderer(action: string, params?: Array<any>): void {
        if (!this.list_of_renderers)
            return;

        for (let i = 0; i < this.list_of_renderers.length; ++i) {
            let c = this.list_of_renderers[i];
            if (c[action])
                c[action].apply(c, params);
        }
    }


    /**
     * Get nodes count
     * @returns {number}
     */
    getNodesCount(): number {
        return Object.keys(this._nodes).length;
    }


    create(node: Node) {
        if (node.onBeforeCreated)
            node.onBeforeCreated();

        this.add(node);

        if (node.onAfterCreated)
            node.onAfterCreated();

        if (this.db) {
            this.db.addNode(node);

            if (this.id == 0)
                this.db.updateLastRootNodeId(this.last_node_id);
            else
                this.db.updateNode(this.container_node.id, this.container_node.container.id, {"sub_container.last_node_id": this.container_node.sub_container.last_node_id});
        }

        log.debug("New node created: " + node.getReadableId());
    }

    /**
     * Adds a new node instasnce to this container
     * @param node the instance of the node
     */
    add(node: Node) {
        if (!node || (node.id != -1 && this._nodes[node.id] != null))
            return; //already added

        if (this.getNodesCount() >= Nodes.options.MAX_NUMBER_OF_NODES)
            throw("Nodes: max number of nodes in a container reached");

        //give him an id
        if (node.id == null || node.id == -1)
            node.id = this.last_node_id++;

        node.container = this;

        this._nodes[node.id] = node;

        /*
         // rendering stuf...
         if(node.bgImageUrl)
         node.bgImage = node.loadImage(node.bgImageUrl);
         */


        if (node.onAdded)
            node.onAdded();

        if (this.config.align_to_grid)
            node.alignToGrid();

        if (this.onNodeAdded)
            this.onNodeAdded(node);


        this.setDirtyCanvas(true, true);
    }


    /**
     * Removes a node from the container
     * @param node the instance of the node
     */
    remove(node: Node): void {
        if (this._nodes[node.id] == null)
            return;

        if (node.ignore_remove)
            return;

        //disconnect inputs
        if (node.inputs)
            for (let i in node.inputs) {
                let input = node.inputs[i];
                if (input.link != null)
                    node.disconnectInput(+i);
            }

        //disconnect outputs
        if (node.outputs)
            for (let o in node.outputs) {
                let output = node.outputs[o];
                if (output.links != null && output.links.length > 0)
                    node.disconnectOutput(+o);
            }

        //event
        if (node.onRemoved)
            node.onRemoved();


        //remove from renderer
        if (this.list_of_renderers) {
            for (let i = 0; i < this.list_of_renderers.length; ++i) {
                let renderer = this.list_of_renderers[i];
                if (renderer.selected_nodes[node.id])
                    delete renderer.selected_nodes[node.id];
                if (renderer.node_dragged == node)
                    renderer.node_dragged = null;
            }
        }

        //remove from container
        delete this._nodes[node.id];

        log.debug("Node deleted: " + node.getReadableId());
        node.container = null;

        if (this.onNodeRemoved)
            this.onNodeRemoved(node);

        if (this.db)
            this.db.removeNode(node.id, this.id);

        this.setDirtyCanvas(true, true);

    }

    /**
     * Returns a node by its id.
     * @param id
     */
    getNodeById(id: number): Node {
        if (id == null) return null;
        return this._nodes[id];
    }


    /**
     * Returns a list of nodes that matches a class
     * @param classObject the class itself (not an string)
     * @returns a list with all the nodes of this type
     */
    getNodesByClass(classObject: any): Array<Node> {
        let r = [];

        for (let id in this._nodes) {
            let node = this._nodes[id];
            if (node.constructor === classObject)
                r.push(node);
        }

        return r;
    }

    /**
     * Returns a list of nodes that matches a type
     * @param type the name of the node type
     * @returns a list with all the nodes of this type
     */
    getNodesByType(type: string): Array<Node> {
        type = type.toLowerCase();
        let r = [];

        for (let id in this._nodes) {
            let node = this._nodes[id];
            if (node.type.toLowerCase() == type)
                r.push(node);
        }

        return r;
    }

    /**
     * Returns a list of nodes that matches a name
     * @param name the name of the node to search
     * @returns a list with all the nodes with this name
     */
    getNodesByTitle(title: string): Array<Node> {
        let r = [];

        for (let id in this._nodes) {
            let node = this._nodes[id];
            if (node.title == title)
                r.push(node);
        }

        return r;
    }

    /**
     * Returns the top-most node in this position of the renderer
     * @param x the x coordinate in renderer space
     * @param y the y coordinate in renderer space
     * @param nodes_list a list with all the nodes to search from, by default is all the nodes in the container
     * @returns a list with all the nodes that intersect this coordinate
     */
    getNodeOnPos(x: number, y: number, nodes_list?: Array<Node>): Node {
        if (nodes_list) {
            for (let i = nodes_list.length - 1; i >= 0; i--) {
                let n = nodes_list[i];
                if (n.isPointInsideNode(x, y, 2))
                    return n;
            }
        }
        else {
            for (let id in this._nodes) {
                let node = this._nodes[id];
                if (node.isPointInsideNode(x, y, 2))
                    return node;
            }
        }
        return null;
    }

    connectionChange(node: Node): void {
        if (this.onConnectionChange)
            this.onConnectionChange(node);
        this.sendActionToRenderer("onConnectionChange");
    }


    /**
     * Set canvas to dirty for update
     * @param foreground
     * @param backgroud
     */
    setDirtyCanvas(foreground?: boolean, backgroud?: boolean): void {
        this.sendActionToRenderer("setDirty", [foreground, backgroud]);
    }


    /**
     * Creates a Object containing all the info about this container, it can be serialized
     * @returns value of the node
     */
    serialize(include_nodes = true): SerializedContainer {

        let data: SerializedContainer = {
            id: this.id,
            last_node_id: this.last_node_id,
            config: this.config
        };

        if (include_nodes) {
            let ser_nodes: Array<SerializedNode> = [];

            for (let id in this._nodes) {
                let node = this._nodes[id];

                ser_nodes.push(node.serialize())
            }

            data.serialized_nodes = ser_nodes;
        }

        if (this.id == 0)
            (<any>data).last_container_id = Container.last_container_id;

        return data;
    }


    /**
     * Add nodes_list to container from a JSON string
     * @param data JSON string
     * @param keep_old
     */
    configure(data: SerializedContainer, keep_old = false): boolean {
        if (!keep_old)
            this.clear();

        //copy all fields to this container
        for (let i in data) {
            if (i == "serialized_nodes")
                continue;

            this[i] = data[i];
        }

        let error = false;

        if (data.serialized_nodes) {
            for (let n of data.serialized_nodes) {
                let node = this.add_serialized_node(n);
                if (!node) error = true;
            }
        }

        if ((<any>data).last_container_id)
            Container.last_container_id = (<any>data).last_container_id;


        this.setDirtyCanvas(true, true);
        return error;
    }


    /**
     * Deserealize node and add
     * @param serialized_node
     * @returns {Node} result node (for check success)
     */
    add_serialized_node(serialized_node: SerializedNode, from_db: boolean = false): Node {
        let node = Nodes.createNode(serialized_node.type, serialized_node.title);
        if (node) {
            node.id = serialized_node.id;
            node.configure(serialized_node, from_db);
            this.add(node);
            this.setDirtyCanvas(true, true);
            return node;
        }
    }


    getParentsStack(): Array<number> {
        let stack = [];

        if (this.parent_container_id) {
            let parentCont = Container.containers[this.parent_container_id];
            for (let i = 0; i < 1000; i++) {
                stack.push(parentCont.id);
                if (!parentCont.parent_container_id)
                    break;

                parentCont = Container.containers[parentCont.parent_container_id];
            }
        }

        stack.push(0);
        return stack;
    }

    mooveNodesToNewContainer(ids: Array<number>, pos: [number, number]) {

        //prevent move input/output nodes
        let l = ids.length;
        while (l--) {
            let node = this.getNodeById(ids[l]);
            if (node.type == "main/input" || node.type == "main/output")
                ids.splice(l, 1);
        }

        if (ids.length == 0)
            return;

        //create new container
        let new_cont_node: ContainerNode = (<any>Nodes).createNode("main/container");
        new_cont_node.pos = pos;
        this.create(new_cont_node);

        let new_cont = new_cont_node.sub_container;
        new_cont.last_node_id = this.last_node_id;


        if (this.db)
            this.db.updateNode(new_cont_node.id, this.id, {"sub_container.last_node_id": new_cont_node.sub_container.last_node_id})

        // move nodes
        for (let id of ids) {
            let node = this.getNodeById(id);

            node.container = new_cont;
            delete this._nodes[node.id];
            new_cont._nodes[node.id] = node;

            if (this.db) {
                this.db.removeNode(node.id, this.id);
                this.db.addNode(node);
            }
        }


        //create container inputs
        for (let id of ids) {
            let node = new_cont.getNodeById(id);
            if (node.inputs) {
                for (let i in node.inputs) {
                    let input = node.inputs[i];
                    if (input.link) {
                        let old_target = this._nodes[input.link.target_node_id];
                        if (old_target) {

                            //create input node
                            let input_node = Nodes.createNode("main/input");
                            input_node.pos = Utils.cloneObject(old_target.pos);
                            input_node.outputs[0].links = [{target_node_id: node.id, target_slot: +i}];

                            //find input new pos (for prevent overlapping with the same input)
                            for (let n in new_cont._nodes) {
                                if (new_cont._nodes[n] != input_node) {
                                    if (input_node.pos[0] == new_cont._nodes[n].pos[0]
                                        && input_node.pos[1] == new_cont._nodes[n].pos[1])
                                        input_node.pos[1] += 15;
                                }
                            }

                            new_cont.create(input_node);


                            //connect new cont input to old target
                            new_cont_node.inputs[input_node.properties.slot].link =
                                {target_node_id: input.link.target_node_id, target_slot: input.link.target_slot}

                            //reconnect old target node to cont input
                            let t_out_links = old_target.outputs[input.link.target_slot].links;
                            for (let out_link of t_out_links) {
                                if (out_link.target_node_id == node.id && out_link.target_slot == +i) {
                                    out_link.target_node_id = new_cont_node.id;
                                    out_link.target_slot = input_node.properties.slot;
                                }
                            }

                            //reconnect node to new input node
                            input.link.target_node_id = input_node.id;
                            input.link.target_slot = 0;

                            if (this.db) {
                                let s_old_target = old_target.serialize(true);
                                let s_node = node.serialize(true);
                                this.db.updateNode(old_target.id, this.id, {outputs: s_old_target.outputs});
                                this.db.updateNode(node.id, new_cont.id, {inputs: s_node.inputs});
                            }
                        }
                    }
                }


            }
        }


        //create container outputs
        for (let id of ids) {
            let node = new_cont.getNodeById(id);
            if (node.outputs) {
                for (let o in node.outputs) {
                    let output = node.outputs[o];
                    if (output.links) {
                        for (let link of output.links) {
                            let old_target = this._nodes[link.target_node_id];
                            if (old_target) {

                                //create output node
                                let output_node = Nodes.createNode("main/output");
                                output_node.pos = Utils.cloneObject(old_target.pos);
                                output_node.inputs[0].link = {target_node_id: node.id, target_slot: +o};


                                //find input new pos (for prevent overlapping with the same input)
                                for (let n in new_cont._nodes) {
                                    if (new_cont._nodes[n] != output_node) {
                                        if (output_node.pos[0] == new_cont._nodes[n].pos[0]
                                            && output_node.pos[1] == new_cont._nodes[n].pos[1])
                                            output_node.pos[1] += 15;
                                    }
                                }

                                new_cont.create(output_node);


                                //connect new cont output to old target
                                new_cont_node.outputs[output_node.properties.slot].links = [{
                                    target_node_id: link.target_node_id,
                                    target_slot: link.target_slot
                                }];

                                //reconnect old target node to cont output
                                let in_link = old_target.inputs[link.target_slot].link;
                                in_link.target_node_id = new_cont_node.id;
                                in_link.target_slot = output_node.properties.slot;


                                //reconnect node to new output node
                                link.target_node_id = output_node.id;
                                link.target_slot = 0;

                                if (this.db) {
                                    let s_old_target = old_target.serialize(true);
                                    let s_node = node.serialize(true);
                                    this.db.updateNode(old_target.id, this.id, {inputs: s_old_target.inputs});
                                    this.db.updateNode(node.id, new_cont.id, {outputs: s_node.outputs});
                                }
                            }
                        }
                    }
                }

                if (this.db) {
                    let s_new_cont_node = new_cont_node.serialize(true);
                    this.db.updateNode(new_cont_node.id, this.id, {inputs: s_new_cont_node.inputs});
                    this.db.updateNode(new_cont_node.id, this.id, {outputs: s_new_cont_node.outputs});
                }
            }
        }


    }
}


// export let rootContainer = new Container();

