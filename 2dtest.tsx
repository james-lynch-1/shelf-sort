import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

interface TreeNode {
    l?: TreeNode;
    r?: TreeNode;
    x: number;
    y: number;
    w: number;
    h: number;
    used: false;
}

// const scene = new THREE.Scene();
// const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const arButton = document.body.appendChild(ARButton.createButton(renderer));
arButton.style["background-color"] = "navy";

class Packer {
    root: { x: number; y: number; w: number; h: number };

    constructor(w, h) {
        this.root = { x: 0, y: 0, w: w, h: h };
    }

    pack(items) {
        let node: TreeNode;
        for (let n = 0; n < items.length; n++) {}
    }

    findNode(root, w, h) {}

    splitNode(node, w, h) {}
}
const packer = new Packer(1, 2);
