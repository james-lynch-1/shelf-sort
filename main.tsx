import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import * as BinPacking from "binpackingjs";
import { drawCanvas } from "./imagecapture.tsx";

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
});
const scene = new THREE.Scene();
const camera = renderer.xr.getCamera();
let fov: number;
const controller = renderer.xr.getController(0);
let session: XRSession | null;
let frame: XRFrame;
let referenceSpace: XRReferenceSpace | null;
const context = renderer.getContext();
let binding: XRWebGLBinding;
let cameraTexture: WebGLTexture;
let viewerPose: XRViewerPose | undefined;
// let track: MediaStreamTrack;
let imageCapture: ImageCapture;

let canvas: HTMLCanvasElement = document.getElementById(
    "takePhotoCanvas",
) as HTMLCanvasElement;

// 1 unit = 1 metre
// state: "tutorialText", "planeButton"

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(render);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
const startButton = ARButton.createButton(
    renderer,
    // , {optionalFeatures: ["camera-access"],}
);
document.body.appendChild(startButton);

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
const cursor = new THREE.TextureLoader().load("/start.png");
cursor.magFilter = THREE.NearestFilter;
cursor.minFilter = THREE.LinearMipMapLinearFilter;
const startSpriteMaterial = new THREE.SpriteMaterial({ map: cursor });
const endSpriteMaterial = new THREE.SpriteMaterial({ map: cursor });
endSpriteMaterial.rotation = Math.PI;
startSpriteMaterial.depthTest = false;
endSpriteMaterial.depthTest = false;

const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
});
const planeGeo = new THREE.PlaneGeometry(2, 2);
const plane = new THREE.Mesh(planeGeo, planeMaterial);

let start = new THREE.Sprite(startSpriteMaterial);
let end = new THREE.Sprite(endSpriteMaterial);

const origin = new THREE.Mesh(box, material);

renderer.xr.addEventListener("sessionstart", () => {
    session = renderer.xr.getSession();
    referenceSpace = renderer.xr.getReferenceSpace();
    session && (binding = new XRWebGLBinding(session, context));
    // scene.clear();
    scene.add(light);
    scene.add(gridHelper);
    scene.add(controller);
    scene.add(origin);
    document.getElementById("tutorialText")?.remove();
    document.getElementById("planeButton")?.remove();
    addDOMElement("tutorialText");
    document
        .getElementsByTagName("svg")[0]
        .addEventListener("beforexrselect", handleExit);
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
        start.scale.set(0.1, 0.1, 0.1);
        start.renderOrder = 999;
        scene.add(start);
    }
    document.getElementById("planeButton")?.remove();
    document.addEventListener("touchmove", handleCursorMove);
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
        end.scale.set(0.1, 0.1, 0.1);
        end.rotateOnWorldAxis(
            camera.getWorldDirection(new THREE.Vector3()),
            Math.PI,
        );
        end.renderOrder = 999;
        scene.remove(end);
        scene.add(end);
        addDOMElement("planeButton");
    }
    controller.removeEventListener("selectend", selectEnd);
}

function addDOMElement(state: string) {
    const divs = document.body.getElementsByTagName("div");
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
    // width: 360, height: 800
    shelfStartVec.project(camera);
    shelfEndVec.project(camera);
    let screenSpaceVectors: THREE.Vector2[] = [
        new THREE.Vector2(
            (0.5 + shelfStartVec.x / 2) *
                screen.width *
                window.devicePixelRatio,
            (0.5 - shelfStartVec.y / 2) *
                screen.height *
                window.devicePixelRatio,
        ),
        new THREE.Vector2(
            (0.5 + shelfEndVec.x / 2) * screen.width * window.devicePixelRatio,
            (0.5 - shelfEndVec.y / 2) * screen.height * window.devicePixelRatio,
        ),
    ];
    // const startXScreen = (0.5 + shelfStartVec.x / 2) * screen.width;
    // const startYScreen = (0.5 - shelfStartVec.y / 2) * screen.height;
    // const endXScreen = (0.5 + shelfEndVec.x / 2) * screen.width;
    // const endYScreen = (0.5 - shelfEndVec.y / 2) * screen.height;

    // canvas.style.width = screen.width + "px";
    // canvas.style.height = screen.height + "px";
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    fov = camera.getEffectiveFOV();
    console.log("fov: " + fov);
    let imageBitmap: ImageBitmap;
    shelfGeo = new THREE.PlaneGeometry(
        planeGeo.parameters.width * Math.abs(shelfStartUV.x - shelfEndUV.x),
        planeGeo.parameters.height * Math.abs(shelfStartUV.y - shelfEndUV.y),
    );
    session
        ?.end()
        .then(() =>
            navigator.mediaDevices
                .enumerateDevices()
                .then((devices) => {
                    devices.forEach((device) => {
                        console.log(
                            `${device.kind}: ${device.label} id = ${device.deviceId}`,
                        );
                    });
                })
                .catch((err) => {
                    console.error(`${err.name}: ${err.message}`);
                }),
        )
        .then(() =>
            navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
                // video: { deviceId: "968faf0fb9541d480b9666897203e1f6673068e8d2a0570c084cf129f833d095" },
            }),
        )
        .then((mediaStream) => {
            let track: MediaStreamTrack = mediaStream.getVideoTracks()[0];
            console.log(track);
            imageCapture = new ImageCapture(track);
            return track;
        })
        .then((track) => captureImage(track, screenSpaceVectors))
        .catch((error) => console.log("imageCapture error: " + error))
        .then(() => startButton.click())
        .then(() => {
            let shelfTexture = new THREE.CanvasTexture(canvas);
            console.log(
                "canvas dimensions: " +
                    canvas.style.height +
                    " " +
                    canvas.style.width,
            );
            return shelfTexture;
        })
        .then((shelfTexture) => {
            const shelfMat = new THREE.MeshBasicMaterial({ map: shelfTexture });
            const shelf = new THREE.Mesh(shelfGeo, shelfMat);
            shelf.name = "shelf";
            let position = new THREE.Vector3();
            position.addVectors(shelfStartVec, shelfEndVec).divideScalar(2);
            // shelf.position.set(position.x, position.y, position.z);
            shelf.position.set(0, 0, -1).applyMatrix4(camera.matrixWorld);
            shelf.quaternion.setFromRotationMatrix(plane.matrix);
            shelf.updateMatrixWorld();
            scene.add(shelf);
            scene.remove(start, end, plane);
            document.getElementById("planeButton")?.remove();
            document.getElementById("tutorialText")?.remove();
        })
        .then(
            () =>
                (document.getElementById("takePhotoCanvas")!.style.display =
                    "inline"),
        );
}

function captureImage(
    track: MediaStreamTrack,
    screenSpaceVectors: THREE.Vector2[],
) {
    imageCapture
        .takePhoto({
            fillLightMode: "off",
            // imageHeight: Math.abs(
            //     screenSpaceVectors[1].y - screenSpaceVectors[0].y,
            // ),
            // imageWidth: Math.abs(
            //     screenSpaceVectors[1].x - screenSpaceVectors[0].x,
            // ),
            imageHeight: 2000,
            imageWidth: 2000,
            redEyeReduction: false,
        })
        .then((blob) => createImageBitmap(blob))
        .then((imageBitmap) => {
            const canvas = document.querySelector("#takePhotoCanvas");
            drawCanvas(canvas, imageBitmap);
            console.log(
                "imagebitmap width: " +
                    imageBitmap.width +
                    ", imagebitmap height: " +
                    imageBitmap.height,
            );
        })
        .catch((error) => console.log(error))
        .then(() => track.stop());
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

let handleExit = function (e) {
    e.preventDefault();
    this.removeEventListener("beforexrselect", handleExit);
};

let handleCursorMove = function (e) {
    scene.remove(end);
    raycaster.setFromXRController(controller);
    const intersects = raycaster.intersectObject(plane, false);
    if (intersects.length > 0) {
        shelfEndVec = intersects[0].point;
        end.position.set(shelfEndVec.x, shelfEndVec.y, shelfEndVec.z);
        end.scale.set(0.1, 0.1, 0.1);
        end.renderOrder = 999;
        scene.add(end);
    }
};

function render() {
    renderer.render(scene, camera);
    // frame = renderer.xr.getFrame();
    // if (referenceSpace && frame) {
    //     viewerPose = frame.getViewerPose(referenceSpace);
    //     if (viewerPose) {
    //         // for (const view of viewerPose.views) {
    //         //     if (view.camera) {
    //         //         cameraTexture = binding.getCameraImage(view.camera);
    //         //     }
    //         // }
    //         cameraTexture = binding.getCameraImage(viewerPose.views[0].camera);
    //     }
    // }
}
