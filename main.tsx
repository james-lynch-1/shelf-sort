import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import * as BinPacking from "binpackingjs";
import * as ThreeMeshUI from "three-mesh-ui";

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
});
const scene = new THREE.Scene();
const camera = renderer.xr.getCamera();
const controller = renderer.xr.getController(0);
let session: XRSession | null;

// 1 unit = 1 metre
// state: "tutorialText", "planeButton"

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(render);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
const startButton = ARButton.createButton(renderer, {optionalFeatures: ['camera-access']});
document.body.appendChild(startButton);
const divs = document.body.getElementsByTagName("div");

const raycaster = new THREE.Raycaster();

let shelfStartVec = new THREE.Vector3();
let shelfEndVec = new THREE.Vector3();
let shelfGeo: THREE.PlaneGeometry;
let shelfStartUV: THREE.Vector2;
let shelfEndUV: THREE.Vector2;

const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
const light = new THREE.HemisphereLight(0xffffff, 0x000000, 3);
light.position.set(0.5, 1, 0.25);
const size = 10;
const divisions = 100;
const gridHelper = new THREE.GridHelper(size, divisions);
const material = new THREE.MeshBasicMaterial({ color: 0x808080 });

const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
});
const planeGeo = new THREE.PlaneGeometry(2, 2);
const plane = new THREE.Mesh(planeGeo, planeMaterial);

let start = new THREE.Mesh(box, material);
let end = new THREE.Mesh(box, material);

const origin = new THREE.Mesh(box, material);

renderer.xr.addEventListener("sessionstart", () => {
    session = renderer.xr.getSession();
});

startButton.addEventListener("click", () => {
    scene.clear();
    scene.add(light);
    scene.add(gridHelper);
    scene.add(controller);
    scene.add(origin);
    document.getElementById("tutorialText")?.remove();
    document.getElementById("planeButton")?.remove();
    addDOMElement("tutorialText");
});

controller.addEventListener("selectstart", function () {
    selectShelf();
});

function selectShelf() {
    scene.remove(start, end);
    scene.remove(scene.getObjectByName("shelf")!);

    plane.position.set(0, 0, -1).applyMatrix4(camera.matrixWorld);
    plane.quaternion.setFromRotationMatrix(camera.matrixWorld);
    plane.updateMatrixWorld();
    scene.add(plane);

    controller.updateMatrixWorld(true);
    raycaster.setFromXRController(controller);
    let intersects = raycaster.intersectObject(plane, false);
    if (intersects.length > 0) {
        shelfStartVec = intersects[0].point;
        shelfStartUV = new THREE.Vector2(
            intersects[0].uv?.x,
            intersects[0].uv?.y,
        );
        start.position.set(shelfStartVec.x, shelfStartVec.y, shelfStartVec.z);
        start.quaternion.setFromRotationMatrix(plane.matrix);
        scene.add(start);
    }
    document.getElementById("planeButton")?.remove();
    controller.addEventListener("selectend", selectEnd);
}

function selectEnd() {
    raycaster.setFromXRController(controller);
    const intersects = raycaster.intersectObject(plane, false);
    if (intersects.length > 0) {
        shelfEndVec = intersects[0].point;
        shelfEndUV = new THREE.Vector2(
            intersects[0].uv?.x,
            intersects[0].uv?.y,
        );
        end.position.set(shelfEndVec.x, shelfEndVec.y, shelfEndVec.z);
        end.quaternion.setFromRotationMatrix(plane.matrix);
        scene.add(end);
        addDOMElement("planeButton");
    }
    controller.removeEventListener("selectend", selectEnd);
}

function addDOMElement(state: string) {
    const overlayDiv =
        divs.length > 0 && divs[0].children[0].tagName == "svg"
            ? divs[0]
            : null;
    overlayDiv && (overlayDiv.id = "overlayDiv");
    switch (state) {
        case "tutorialText":
            if (!document.getElementById("tutorialText")) {
                const tutorialText = document.createElement("p");
                tutorialText.innerHTML =
                    "Face the shelf directly.<br/>Drag to select shelf\n";
                tutorialText.id = "tutorialText";
                overlayDiv!.appendChild(tutorialText);
            }
            break;
        case "planeButton":
            if (!document.getElementById("planeButton")) {
                const planeButton = document.createElement("button");
                planeButton.innerHTML = "Select shelf";
                planeButton.id = "planeButton";
                overlayDiv!.appendChild(planeButton);
                planeButton.addEventListener("beforexrselect", (e) => {
                    e.preventDefault();
                });
                planeButton.addEventListener("click", createShelf);
            }
            break;
    }
}

function createShelf() {
    shelfGeo = new THREE.PlaneGeometry(
        planeGeo.parameters.width * Math.abs(shelfStartUV.x - shelfEndUV.x),
        planeGeo.parameters.height * Math.abs(shelfStartUV.y - shelfEndUV.y),
    );
    const shelf = new THREE.Mesh(shelfGeo, material);
    shelf.name = "shelf";
    let position = new THREE.Vector3();
    position.addVectors(shelfStartVec, shelfEndVec).divideScalar(2);
    shelf.position.set(position.x, position.y, position.z);
    shelf.quaternion.setFromRotationMatrix(plane.matrix);
    scene.add(shelf);
    scene.remove(start, end);
}

function packBin() {
    const { Item, Bin, Packer } = BinPacking.BP3D;
    let bin1 = new Bin("Shelf", 296, 296, 8, 1000);
    let item1 = new Item("Item 1", 250, 250, 2, 200);
    let item2 = new Item("Item 2", 250, 250, 2, 200);
    let item3 = new Item("Item 3", 250, 250, 2, 200);
    let packer = new Packer();

    packer.addBin(bin1);
    packer.addItem(item1);
    packer.addItem(item2);
    packer.addItem(item3);

    // pack items into bin1
    packer.pack();

    // item1, item2, item3
    console.log(bin1.items);

    // items will be empty, all items was packed
    console.log(packer.items);

    // unfitItems will be empty, all items fit into bin1
    console.log(packer.unfitItems);
}

function render() {
    renderer.render(scene, camera);
}
