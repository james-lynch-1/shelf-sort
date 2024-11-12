import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { InferenceEngine } from "inferencejs";
import { BP2D } from "binpackingjs";
const { Bin, Box, Packer, heuristics } = BP2D;

// console.log(
//     "window.innerWidth + window.innerHeight: " + window.innerWidth + " " + window.innerHeight,
// );
// console.log("screen.width + screen.height: " + screen.width + " " + screen.height);

// take photo stuff
const circles = [...document.getElementsByClassName("circle")] as HTMLImageElement[];
let currentlySelectedCircle: HTMLElement;
const spinnerDiv = document.getElementById("spinnerDiv") as HTMLElement;
let imageCapture: ImageCapture;
const video = document.getElementById("video") as HTMLElement;
// let fullscreenButton = document.getElementById(
//     "fullscreenButton",
// ) as HTMLButtonElement;
const takePhotoButton = document.getElementById("takePhotoButton") as HTMLButtonElement;
const takePhotoCanvas = document.getElementById("takePhotoCanvas") as HTMLCanvasElement;
const drawingCanvas = document.getElementById("drawingCanvas") as HTMLCanvasElement;
const shelfCanvas = document.getElementById("shelfCanvas") as HTMLCanvasElement;
const backButton = document.getElementById("backButton") as HTMLButtonElement;
const nextButton = document.getElementById("nextButton") as HTMLButtonElement;
const tutorialDiv = document.getElementById("tutorialDiv") as HTMLElement;
const booksDiv = document.getElementById("booksDiv") as HTMLDivElement;

// image recognition stuff
const inferEngine = new InferenceEngine();
const workerId = await inferEngine.startWorker("book3-xgza2", 1, "rf_deuMCNNQDoaNAuM3ubxJlr0Niq53");
let sortedBooks: (typeof Box)[];
console.log("workerId: " + workerId);

// xr stuff. NB: 1 unit = 1 metre
const placeShelfButtonXR = document.getElementById("placeShelfButtonXR") as HTMLButtonElement;
const backButtonXR = document.getElementById("backButtonXR") as HTMLButtonElement;
const farBackButtonXR = document.getElementById("farBackButtonXR") as HTMLButtonElement;
const retryButtonXR = document.getElementById("retryButtonXR") as HTMLButtonElement;
const nextButtonXR = document.getElementById("nextButtonXR") as HTMLButtonElement;
const farNextButtonXR = document.getElementById("farNextButtonXR") as HTMLButtonElement;
const tutorialText = document.getElementById("tutorialText") as HTMLParagraphElement;
const indicatorText = document.getElementById("indicatorText") as HTMLParagraphElement;
const spinnerDivXR = document.getElementById("spinnerDivXR") as HTMLDivElement;
const pinchDiv = document.getElementById("pinchDiv") as HTMLDivElement;
const pinchTutorialDiv = document.getElementById("pinchTutorialDiv") as HTMLDivElement;
const sliderDivXR = document.getElementById("sliderDivXR") as HTMLDivElement;
let baseShelfPosition = new THREE.Vector3();

let shelfPlaced = true;
let pinchTutorialRead = false;
let sortedBooksPlaced = 0;
let placedOrderMap: Map<number | undefined, THREE.Mesh> = new Map();
let overlayDiv: HTMLDivElement | null;
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
});
const scene = new THREE.Scene();
const camera = renderer.xr.getCamera();
let session: XRSession | null;
let frame: XRFrame;
let referenceSpace: XRReferenceSpace | null;
let hitTestSource: XRHitTestSource;
let hitTestSourceRequested = false;
// let hitting: Boolean;
// let hittingLastFrame: Boolean;
let hitting: Array<Boolean[]>[2]; // hitting[0]: this frame, hitting[1]: last frame

// const light = new THREE.HemisphereLight(0x888888, 0x000000, 3);
// light.position.set(0.5, 1, 0.25);
const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
// const size = 10;
// const divisions = 100;
// const gridHelper = new THREE.GridHelper(size, divisions);
const material = new THREE.MeshBasicMaterial({
    color: 0x808080,
});
let shelfGroup: THREE.Group;

// const origin = new THREE.Mesh(box, material);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
const startButton = ARButton.createButton(renderer, { requiredFeatures: ["hit-test"] });
startButton.hidden = true;
document.body.appendChild(startButton);

// pinch zoom stuff
let evCache: PointerEvent[] = [];
let prevDiff = -1;

// depth adjust stuff
let depthSliderPos = 0;

// console.log(window.screen.availHeight, window.screen.height);

init();

function init() {
    // fullscreenButton.addEventListener("click", onFullscreenButtonClick);
    takePhotoButton.addEventListener("click", onTakePhotoButtonClick);
    backButton.addEventListener("click", onBackButtonClick);
    nextButton.addEventListener("click", onNextButtonClick);

    backButtonXR.addEventListener("click", onBackButtonXRClick);
    farBackButtonXR.addEventListener("click", (e) => {
        e.preventDefault();
        while (sortedBooksPlaced > 0) onBackButtonXRClick(e);
    });
    placeShelfButtonXR.addEventListener("click", placeShelfXR);
    retryButtonXR.addEventListener("click", onRetryButtonXRClick);
    nextButtonXR.addEventListener("click", onNextButtonXRClick);
    farNextButtonXR.addEventListener("click", (e) => {
        e.preventDefault();
        while (sortedBooksPlaced < sortedBooks.length) onNextButtonXRClick(e);
    });

    shelfGroup = new THREE.Group();
    shelfGroup.scale.set(0.0005, 0.0005, 0.0005);
    shelfGroup.name = "shelfGroup";
    for (let i = 0; i < circles.length; i++) {
        // don't drawrectangle for xr
        if (circles[i].id != "circleXR") {
            circles[i].addEventListener("touchstart", handleDrag);
            circles[i].addEventListener("touchmove", drawRectangle);
        }
        // prevent right click on long press of circles
        circles[i].addEventListener("contextmenu", (e) => e.preventDefault());
    }
    sliderDivXR.addEventListener("touchstart", moveSliderXR);
    sliderDivXR.addEventListener("touchmove", moveSliderXR);
    pinchDiv.onpointerdown = handlePinchDivPointerDown;
    pinchDiv.onpointermove = handlePinchDivPointerMove;
    pinchDiv.onpointerup = handlePinchDivPointerUp;
    pinchDiv.onpointercancel = handlePinchDivPointerUp;
    pinchDiv.onpointerout = handlePinchDivPointerUp;
    pinchDiv.onpointerleave = handlePinchDivPointerUp;
    getUserMedia();
}

// screen.orientation.addEventListener("change", (e) => {
//     switch (screen.orientation.type) {
//         case "landscape-primary":
//         case "landscape-secondary": {
//             console.log("landscape!");
//             break;
//         }
//         case "portrait-primary": {
//             console.log("portrait!");
//             break;
//         }
//     }
// });

renderer.xr.addEventListener("sessionstart", async () => {
    hitting = [false, false];
    session = renderer.xr.getSession() as XRSession;
    session.addEventListener("end", handleExit);
    // identifying the DOMOverlay div created by ARButton (it has no id)
    if (!overlayDiv) {
        const divs = document.body.getElementsByTagName("div");
        for (let i = divs.length - 1; i != 0; i--) {
            if (divs[i].children && divs[i].children[0].tagName == "svg") {
                overlayDiv = divs[i];
                break;
            }
        }
    }
    if (overlayDiv) {
        overlayDiv.appendChild(pinchDiv);
        indicatorText && overlayDiv.appendChild(indicatorText);
        overlayDiv.appendChild(spinnerDivXR);
        overlayDiv.appendChild(backButtonXR);
        overlayDiv.appendChild(farBackButtonXR);
        overlayDiv.appendChild(retryButtonXR);
        overlayDiv.appendChild(placeShelfButtonXR);
        overlayDiv.appendChild(nextButtonXR);
        overlayDiv.appendChild(farNextButtonXR);
        overlayDiv.appendChild(tutorialText);
        overlayDiv.appendChild(pinchTutorialDiv);
        overlayDiv.appendChild(sliderDivXR);
        let exitButton = overlayDiv.getElementsByTagName("svg")[0];
        exitButton.style.zIndex = "999";
        overlayDiv.style.display = "inline";
    }
    depthSliderPos = 0;
    circles[2].style.left = window.innerWidth / 2 + "px";
    spinnerDivXR.style.display = "inline";
    console.log("available features: " + session?.enabledFeatures);
    scene.clear();
    // scene.add(light);
    // scene.add(gridHelper);
    // scene.add(origin);
    const rectX = getComputedStyle(circles[0]).left.split("px")[0] as unknown as number;
    const rectY = getComputedStyle(circles[0]).top.split("px")[0] as unknown as number;
    const rectWidth = Math.abs(
        (getComputedStyle(circles[1]).left.split("px")[0] as unknown as number) - rectX,
    );
    const rectHeight = Math.abs(
        (getComputedStyle(circles[1]).top.split("px")[0] as unknown as number) - rectY,
    );
    const predictions = await imageRec();
    sortedBooks = sortBooks(predictions);
    generateBookCanvases(predictions, rectX, rectY, rectWidth, rectHeight);
    drawShelfXR(shelfGroup);
    handleStateChangeXR("placingShelf");
    spinnerDiv.style.display = "none";
    renderer.setAnimationLoop(render);
});

function drawShelfXR(shelfGroup: THREE.Group<THREE.Object3DEventMap>) {
    let shelfGeo = new THREE.PlaneGeometry(
        getComputedStyle(shelfCanvas).width.split("px")[0] as unknown as number,
        getComputedStyle(shelfCanvas).height.split("px")[0] as unknown as number,
    );
    const texture = new THREE.CanvasTexture(shelfCanvas);
    const shelfMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.3,
    });
    let shelfMesh = new THREE.Mesh(shelfGeo, shelfMaterial);
    shelfMesh.name = "shelfMesh";
    shelfGroup.add(shelfMesh);
    shelfGroup.add(new THREE.AxesHelper());
    generateBookMeshes(shelfGroup);
    scene.add(shelfGroup);
}

function placeShelfXR() {
    handleStateChangeXR("shelfPlaced");
    console.log(shelfGroup);
}

function generateBookMeshes(shelfGroup: THREE.Group) {
    let visited: number[] = [];
    placedOrderMap.clear();
    const shelfMesh = shelfGroup.getObjectByName("shelfMesh") as THREE.Mesh;
    for (let i = 0; i < booksDiv.childNodes.length; i++) {
        const bookCanvas = booksDiv.childNodes[i] as HTMLCanvasElement;
        const bookGeo = new THREE.BoxGeometry(
            getComputedStyle(bookCanvas).width.split("px")[0] as unknown as number,
            getComputedStyle(bookCanvas).height.split("px")[0] as unknown as number,
            200,
        );
        const texture = new THREE.CanvasTexture(bookCanvas);
        const bookMat = new THREE.MeshBasicMaterial({
            map: texture,
        });
        const bookMesh = new THREE.Mesh(bookGeo, bookMat);
        bookMesh.name = "bookMesh" + i;
        shelfGroup.add(bookMesh);
        let sortedArrayIndex: number | undefined;
        // matching sorted book indices with meshes
        for (let j = 0; j < sortedBooks.length; j++) {
            if (visited.includes(j)) {
                continue;
            }
            if (
                (bookCanvas.width == Math.trunc(sortedBooks[j].width) &&
                    bookCanvas.height == Math.trunc(sortedBooks[j].height)) ||
                // check if book has been rotated
                (bookCanvas.width == Math.trunc(sortedBooks[j].height) &&
                    bookCanvas.height == Math.trunc(sortedBooks[j].width))
            ) {
                sortedArrayIndex = j;
                if (bookCanvas.width == Math.trunc(sortedBooks[j].height))
                    bookMesh.userData.rotated = true;
                visited.push(j);
                break;
            }
        }
        bookMesh.userData.sortedArrayIndex = sortedArrayIndex;
        placedOrderMap.set(sortedArrayIndex, bookMesh);
        if (sortedArrayIndex == undefined) bookMesh.visible = false;
        const bookCanvasPosition = {
            x: getComputedStyle(bookCanvas).left.split("px")[0] as unknown as number,
            y: getComputedStyle(bookCanvas).top.split("px")[0] as unknown as number,
        };
        const bookCanvasSize = {
            width: Math.trunc(
                getComputedStyle(bookCanvas).width.split("px")[0] as unknown as number,
            ),
            height: Math.trunc(
                getComputedStyle(bookCanvas).height.split("px")[0] as unknown as number,
            ),
        };
        placeBookXR(shelfMesh, bookMesh, bookCanvasPosition, bookCanvasSize);
    }
    // console.table(placedOrderMap);
}

function placeBookXR( // takes top-left point coords
    shelfMesh: THREE.Mesh,
    bookMesh: THREE.Mesh,
    position: {
        x: number;
        y: number;
    },
    size: { width: number; height: number },
) {
    let shelfGeo = shelfMesh.geometry as THREE.PlaneGeometry;
    let shelfTopLeft = {
        x: shelfMesh.position.x - shelfGeo.parameters.width / 2,
        y: shelfMesh.position.y + shelfGeo.parameters.height / 2,
    };
    let bookGeo = bookMesh.geometry as THREE.BoxGeometry;
    bookMesh.position.set(
        shelfTopLeft.x + +position.x + size.width / 2,
        shelfTopLeft.y - position.y - size.height / 2,
        shelfMesh.position.z - bookGeo.parameters.depth / 2 + 1,
    );
}

function manageOverlayXR() {
    indicatorText.innerHTML = sortedBooksPlaced + "/" + sortedBooks.length;
    if (!shelfPlaced) {
        tutorialText.style.bottom = "100px";
        tutorialText.innerHTML = "Finding surface...<br/>Try looking around.";
        tutorialText.style.display = "block";
        spinnerDivXR.style.display = "inline";
        pinchDiv.style.display = "inline";
        indicatorText.style.display = "none";
        pinchTutorialDiv.style.display = "none";
        retryButtonXR.style.display = "none";
        backButtonXR.style.display = "none";
        farBackButtonXR.style.display = "none";
        nextButtonXR.style.display = "none";
        farNextButtonXR.style.display = "none";
        placeShelfButtonXR.style.display = "none";
        sliderDivXR.style.display = "none";
        circles[2].style.display = "none";
        if (hitting[0]) {
            if (!pinchTutorialRead) pinchTutorialDiv.style.display = "inline";
            tutorialText.innerHTML = 'Align books with shelf and click "Place".';
            placeShelfButtonXR.style.display = "flex";
            spinnerDivXR.style.display = "none";
        }
    } else if (shelfPlaced) {
        tutorialText.style.bottom = "203px";
        placeShelfButtonXR.style.display = "none";
        indicatorText.style.display = "flex";
        retryButtonXR.style.display = "flex";
        sliderDivXR.style.display = "inline";
        circles[2].style.display = "inline";
        switch (true) {
            case sortedBooksPlaced == sortedBooks.length:
                backButtonXR.style.display = "flex";
                farBackButtonXR.style.display = "flex";
                nextButtonXR.style.display = "none";
                farNextButtonXR.style.display = "none";
                break;

            case sortedBooksPlaced > 0:
                backButtonXR.style.display = "flex";
                farBackButtonXR.style.display = "flex";
                nextButtonXR.style.display = "flex";
                farNextButtonXR.style.display = "flex";
                pinchTutorialRead = true;
                pinchTutorialDiv.style.display = "none";
                tutorialText.style.display = "none";
                break;

            case sortedBooksPlaced == 0:
                backButtonXR.style.display = "none";
                farBackButtonXR.style.display = "none";
                nextButtonXR.style.display = "flex";
                farNextButtonXR.style.display = "flex";
                tutorialText.innerHTML = 'Tap "Next" to place virtual books.';
                break;
        }
    }
}

function onNextButtonXRClick(e) {
    e.preventDefault();
    placeBookSortedXR(e);
    manageOverlayXR();
    if (sortedBooksPlaced == sortedBooks.length) {
        console.log("all done!");
        let unsortedBooks: THREE.Mesh[] = [];
        for (let book of placedOrderMap) {
            if (book[1].userData.sortedArrayIndex == undefined)
                unsortedBooks.push(book[1] as THREE.Mesh);
        }
        console.log(unsortedBooks);
        return;
    }
}

function onBackButtonXRClick(e) {
    e.preventDefault();
    sortedBooksPlaced--;
    console.log("sorted books placed: " + sortedBooksPlaced);
    const shelfMesh = scene.getObjectByName("shelfMesh") as THREE.Mesh;
    const bookMesh = placedOrderMap.get(sortedBooksPlaced);
    if (!bookMesh) return;
    if (bookMesh.userData.sortedArrayIndex == undefined) {
        onBackButtonXRClick(e);
        return;
    }
    bookMesh.visible = false;
    const bookCanvas = document.getElementById(
        "bookCanvas" + bookMesh.name.split("Mesh")[1],
    ) as HTMLCanvasElement;
    const bookCanvasPosition = {
        x: getComputedStyle(bookCanvas).left.split("px")[0] as unknown as number,
        y: getComputedStyle(bookCanvas).top.split("px")[0] as unknown as number,
    };
    const bookCanvasSize = {
        width: getComputedStyle(bookCanvas).width.split("px")[0] as unknown as number,
        height: getComputedStyle(bookCanvas).height.split("px")[0] as unknown as number,
    };
    if (bookMesh.userData.rotated) bookMesh.rotateZ(-Math.PI / 2);
    let prevBookMesh = placedOrderMap.get(sortedBooksPlaced - 1) as THREE.Mesh | undefined;
    let bookMat = prevBookMesh?.material as THREE.MeshBasicMaterial | undefined;
    bookMat && bookMat.color.set(0xaaffaa);
    placeBookXR(shelfMesh, bookMesh, bookCanvasPosition, bookCanvasSize);
    manageOverlayXR();
    if (sortedBooksPlaced == 0) {
        for (let book of placedOrderMap) {
            book[0] != undefined && (book[1].visible = true);
            let mat = book[1].material as THREE.MeshBasicMaterial;
            mat.color.set(0xffffff);
        }
        return;
    }
}

function onRetryButtonXRClick(e) {
    e.preventDefault();
    handleStateChangeXR("placingShelf");
}

// each time you press nextButtonXR, place the next item in the packed books array
function placeBookSortedXR(e) {
    const shelfMesh = scene.getObjectByName("shelfMesh") as THREE.Mesh;
    let bookMesh: THREE.Mesh | undefined;
    let bookCanvas: HTMLCanvasElement | undefined;
    bookMesh = placedOrderMap.get(sortedBooksPlaced);
    if (!bookMesh) {
        console.log("Error: Cannot find sorted book corresponding to this mesh");
        sortedBooksPlaced++;
        onNextButtonXRClick(e);
        return;
    }
    bookCanvas = booksDiv.children[
        bookMesh.name.split("Mesh")[1] as unknown as number
    ] as HTMLCanvasElement;
    let bookMat = bookMesh.material as THREE.MeshBasicMaterial;
    for (let book of placedOrderMap) {
        let mat = book[1].material as THREE.MeshBasicMaterial;
        mat.color.set(0xffffff);
        if ((book[0] && book[0] > sortedBooksPlaced) || book[0] == undefined) {
            book[1].visible = false;
        }
    }
    bookMat.color.set(0xaaffaa);
    const sortedBookSize = {
        width: sortedBooks[sortedBooksPlaced].width,
        height: sortedBooks[sortedBooksPlaced].height,
    };
    // change to top-left point coords
    const sortedBookPosition = {
        x: sortedBooks[sortedBooksPlaced].x,
        y: sortedBooks[sortedBooksPlaced].y,
    };
    console.log(
        "cWidth: " +
            bookCanvas.width +
            ", sWidth: " +
            sortedBooks[sortedBooksPlaced].width +
            ", cHeight: " +
            bookCanvas.height +
            ", sHeight: " +
            sortedBooks[sortedBooksPlaced].height +
            ", sx: " +
            sortedBookPosition.x +
            ", sy: " +
            sortedBookPosition.y,
    );
    if (bookMesh.userData.rotated) {
        bookMesh.rotateZ(Math.PI / 2);
        console.log(bookMesh.userData);
        console.log("rotating");
    }
    bookMesh.visible = true;
    placeBookXR(shelfMesh, bookMesh, sortedBookPosition, sortedBookSize);
    console.log("placed book " + sortedBooksPlaced);
    sortedBooksPlaced++;
}

function getUserMedia() {
    spinnerDiv.style.display = "inline";
    navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then((mediaStream) => {
            document.querySelector("video")!.srcObject = mediaStream;
            const track = mediaStream.getVideoTracks()[0];
            imageCapture = new ImageCapture(track);
            return track;
        })
        .then(() => {
            tutorialDiv.style.display = "inline-block";
            spinnerDiv.style.display = "none";
            takePhotoButton.style.display = "inline";
            tutorialDiv.children[0].innerHTML = "Facing the shelf directly, take a photo.";
        })
        .catch((error) => {
            console.log(error);
            window.onfocus = reloadPage;
        });
}

function onTakePhotoButtonClick() {
    tutorialDiv.style.display = "none";
    handleStateChange("cropping");
    takePhotoCanvas.style.width = video.style.width;
    takePhotoCanvas.style.height = video.style.height;

    takePhotoCanvas
        .getContext("2d")!
        .clearRect(0, 0, takePhotoCanvas.width, takePhotoCanvas.height);
    imageCapture
        .takePhoto()
        .then((blob) => createImageBitmap(blob))
        .then((imageBitmap) => {
            drawCanvas(takePhotoCanvas as HTMLCanvasElement, imageBitmap);
            imageBitmap.close();
        })
        .then(() => (takePhotoCanvas.style.display = "inline"))
        .catch((error) => console.log(error))
        .then(() => {
            imageCapture.track.stop();
            spinnerDiv.style.display = "none";
            backButton.style.display = "flex";
            nextButton.style.display = "flex";
            tutorialDiv.style.display = "inline-block";
        });
    takePhotoCanvas.style.display = "inline";
}

function onBackButtonClick() {
    tutorialDiv.style.display = "none";
    getUserMedia();
    handleStateChange("start");
}

async function onNextButtonClick() {
    const rectX = getComputedStyle(circles[0]).left.split("px")[0] as unknown as number;
    const rectY = getComputedStyle(circles[0]).top.split("px")[0] as unknown as number;
    const rectWidth = Math.abs(
        (getComputedStyle(circles[1]).left.split("px")[0] as unknown as number) - rectX,
    );
    const rectHeight = Math.abs(
        (getComputedStyle(circles[1]).top.split("px")[0] as unknown as number) - rectY,
    );
    cropToSelection(rectX, rectY, rectWidth, rectHeight);
    spinnerDiv.style.display = "inline";
    tutorialDiv.style.display = "none";
    nextButton.style.display = "none";
    backButton.style.display = "none";
    startButton.click();
}

function handleDrag(e: TouchEvent) {
    const circle = document.elementFromPoint(
        e.touches[0].clientX,
        e.touches[0].clientY,
    ) as HTMLElement;
    if (circle?.className == "circle") {
        currentlySelectedCircle = circle;
    }
}

// source: mdn
function handlePinchDivPointerDown(e: PointerEvent) {
    evCache.push(e);
    pinchTutorialRead = true;
    pinchTutorialDiv.style.display = "none";
    // console.log("pointerDown", e);
}

function handlePinchDivPointerMove(e: PointerEvent) {
    // const rotation = shelfGroup.rotation;
    // const shelfDir = new THREE.Vector3().setFromEuler(rotation).normalize();
    // shelfGroup.getWorldDirection(shelfDir).normalize();
    // console.log("pointerMove", e);
    const index = evCache.findIndex((cachedEv) => cachedEv.pointerId === e.pointerId);
    evCache[index] = e;
    if (evCache.length == 2) {
        // Calculate the distance between the two pointers
        const curDiff = Math.sqrt(
            Math.pow(evCache[0].clientX - evCache[1].clientX, 2) +
                Math.pow(evCache[0].clientY - evCache[1].clientY, 2),
        );

        if (prevDiff > 0) {
            if (curDiff > prevDiff) {
                // The distance between the two pointers has increased
                // console.log("Pinch moving OUT -> Zoom in", e);
                if (shelfGroup.scale.x > 0.001) {
                    prevDiff = curDiff;
                    return;
                }
            }
            if (curDiff < prevDiff) {
                // The distance between the two pointers has decreased
                // console.log("Pinch moving IN -> Zoom out", e);
                if (shelfGroup.scale.x < 0.00025) {
                    prevDiff = curDiff;
                    return;
                }
            }
            // shelfGroup.translateOnAxis(zVec, (curDiff - prevDiff) / 512);
            shelfGroup.scale.set(
                ...new THREE.Vector3(
                    shelfGroup.scale.x + (curDiff - prevDiff) / 500000,
                    shelfGroup.scale.y + (curDiff - prevDiff) / 500000,
                    shelfGroup.scale.z,
                ).toArray(),
            );
        }

        // Cache the distance for the next move event
        prevDiff = curDiff;
    }
}

function handlePinchDivPointerUp(e: PointerEvent) {
    // console.log(e.type, e);
    // Remove this pointer from the cache and reset the target's
    // background and border
    const index = evCache.findIndex((cachedEv) => cachedEv.pointerId === e.pointerId);
    evCache.splice(index, 1);

    // If the number of pointers down is less than two then reset diff tracker
    if (evCache.length < 2) {
        prevDiff = -1;
    }
}

function moveSliderXR(e: TouchEvent) {
    e.preventDefault();
    const sliderDivXRWidth = getComputedStyle(sliderDivXR).width.split(
        "px",
    )[0] as unknown as number;
    const sliderDivXRLeft = (window.innerWidth - sliderDivXRWidth) / 2;
    if (
        e.touches[0].clientX > 1.5 * sliderDivXRLeft &&
        e.touches[0].clientX < +sliderDivXRWidth + sliderDivXRLeft / 2
    ) {
        circles[2].style.left = e.touches[0].clientX + "px";
        if (
            e.touches[0].clientX > window.innerWidth / 2 - sliderDivXRLeft / 4 &&
            e.touches[0].clientX < window.innerWidth / 2 + sliderDivXRLeft / 4
        ) {
            circles[2].style.left = window.innerWidth / 2 + "px";
        }
    }
    adjustDepth(
        circles[2].style.left.split("px")[0] as unknown as number,
        sliderDivXRWidth,
        sliderDivXRLeft,
    );
}

function adjustDepth(circleX, sliderDivXRWidth, sliderDivXRLeft) {
    depthSliderPos = circleX - +sliderDivXRWidth / 2 - sliderDivXRLeft;
}

let handleExit = function (e) {
    e.preventDefault();
    nextButton.style.display = "flex";
    backButton.style.display = "flex";
    hitTestSourceRequested = false;
    hitTestSource.cancel();
    hitTestSource = null as any;
    // pinchTutorialDiv.style.display = "none";
    sortedBooksPlaced = 0;
    this.removeEventListener("beforexrselect", handleExit);
    // placeShelfButtonXR.removeEventListener("click", placeShelfXR);
    if (overlayDiv)
        for (let child of overlayDiv.children as HTMLCollectionOf<HTMLElement>)
            if (child.tagName != "svg") child.style.display = "none";
    const disposables: Array<THREE.BufferGeometry | THREE.CanvasTexture | THREE.MeshBasicMaterial> =
        [];
    for (let i = 0; i < booksDiv.childNodes.length; i++) {
        let bookMesh = shelfGroup.getObjectByName("bookMesh" + i) as THREE.Mesh;
        disposables.push(
            bookMesh.geometry as THREE.BufferGeometry,
            (bookMesh.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture,
            bookMesh.material as THREE.MeshBasicMaterial,
        );
    }
    const shelfMesh = shelfGroup.getObjectByName("shelfMesh") as THREE.Mesh;
    disposables.push(
        shelfMesh.geometry,
        (shelfMesh.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture,
        shelfMesh.material as THREE.MeshBasicMaterial,
    );
    // console.table(disposables);
    for (let obj of disposables) {
        let type = typeof obj;
        switch (type as string) {
            case "THREE.BufferGeometry":
                (obj as THREE.BufferGeometry).dispose();
                break;
            case "THREE.CanvasTexture":
                (obj as THREE.CanvasTexture).dispose();
                break;
            case "THREE.MeshBasicMaterial":
                (obj as THREE.MeshBasicMaterial).dispose();
                break;
        }
    }
    // console.table(disposables);
    const disposableMeshes: THREE.Object3D[] = [];
    shelfGroup.traverse((child) => {
        disposableMeshes.push(child);
    });
    shelfGroup.remove(...disposableMeshes);
    scene.remove(...disposableMeshes);
    scene.remove(shelfGroup);
    renderer.renderLists.dispose();
};

/* Utils */

function reloadPage() {
    window.location.reload();
}

function handleStateChange(state: String) {
    switch (state) {
        case "start":
            video.hidden = false;
            takePhotoCanvas.style.display = "none";
            backButton.style.display = "none";
            nextButton.style.display = "none";
            circles[0].style.display = "none";
            circles[1].style.display = "none";
            drawingCanvas
                .getContext("2d")
                ?.clearRect(0, 0, takePhotoCanvas.width, takePhotoCanvas.height);
            break;

        case "cropping":
            video.hidden = true;
            tutorialDiv.children[0].innerHTML = "Drag the points to match the shelf dimensions.";
            spinnerDiv.style.display = "inline";
            takePhotoCanvas.style.display = "none";
            takePhotoButton.style.display = "none";
            break;
    }
}

function handleStateChangeXR(state: string) {
    const shelfMesh = shelfGroup.getObjectByName("shelfMesh") as THREE.Mesh;
    switch (state) {
        case "placingShelf":
            shelfPlaced = false;
            shelfMesh.visible = true;
            shelfGroup.visible = hitting[0] ? true : false;
            manageOverlayXR();
            // backButtonXR.removeEventListener("click", onBackButtonXRClick);
            // retryButtonXR.removeEventListener("click", onRetryButtonXRClick);
            // nextButtonXR.removeEventListener("click", onNextButtonXRClick);
            break;

        case "shelfPlaced":
            shelfPlaced = true;
            shelfMesh.visible = false;
            manageOverlayXR();
            break;
    }
}

function drawCanvas(takePhotoCanvas: HTMLCanvasElement, img) {
    takePhotoCanvas.width = getComputedStyle(takePhotoCanvas).width.split(
        "px",
    )[0] as unknown as number;
    takePhotoCanvas.height = takePhotoCanvas.width * (img.height / img.width);
    console.log("img width, height: " + img.width + ", " + img.height);
    console.log(
        "takePhotoCanvas width, height: " + takePhotoCanvas.width + ", " + takePhotoCanvas.height,
    );
    let ratio = Math.min(takePhotoCanvas.width / img.width, takePhotoCanvas.height / img.height);
    let x = (takePhotoCanvas.width - img.width * ratio) / 2;
    let y = (takePhotoCanvas.height - img.height * ratio) / 2;
    takePhotoCanvas
        .getContext("2d")!
        .drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width * ratio, img.height * ratio);
    drawingCanvas.width = takePhotoCanvas.width;
    drawingCanvas.height = takePhotoCanvas.height;
    circles[1].style.left = takePhotoCanvas.width - 100 + "px";
    circles[1].style.top = takePhotoCanvas.height - 100 + "px";
    circles[0].style.display = "inline";
    circles[1].style.display = "inline";
    drawRectangle();
}

function drawRectangle(e?: TouchEvent) {
    if (e) {
        const otherCircle =
            currentlySelectedCircle.id == "circle0"
                ? (document.getElementById("circle1") as HTMLElement)
                : (document.getElementById("circle0") as HTMLElement);

        let passing =
            currentlySelectedCircle.id == "circle0"
                ? function (touch: number, otherCircleCoord: number) {
                      return touch > otherCircleCoord;
                  }
                : function (touch: number, otherCircleCoord: number) {
                      return touch < otherCircleCoord;
                  };
        if (
            passing(
                e.touches[0].clientY,
                getComputedStyle(otherCircle).top.split("px")[0] as unknown as number,
            )
        ) {
            currentlySelectedCircle.style.top = otherCircle.style.top;
        } else currentlySelectedCircle.style.top = e.touches[0].clientY + "px";
        if (
            passing(
                e.touches[0].clientX,
                getComputedStyle(otherCircle).left.split("px")[0] as unknown as number,
            )
        ) {
            currentlySelectedCircle.style.left = otherCircle!.style.left;
        } else currentlySelectedCircle.style.left = e.touches[0].clientX + "px";
        if (e.touches[0].clientY > drawingCanvas.height && currentlySelectedCircle.id == "circle1")
            currentlySelectedCircle.style.top = drawingCanvas.height + "px";
    }
    const context = drawingCanvas.getContext("2d") as CanvasRenderingContext2D;
    context.lineWidth = 10;
    context.strokeStyle = "gray";
    const x1 = getComputedStyle(circles[0]).left.split("px")[0] as unknown as number;
    const y1 = getComputedStyle(circles[0]).top.split("px")[0] as unknown as number;
    const width = Math.abs(
        (getComputedStyle(circles[1]).left.split("px")[0] as unknown as number) - x1,
    );
    const height = Math.abs(
        (getComputedStyle(circles[1]).top.split("px")[0] as unknown as number) - y1,
    );
    context.clearRect(0, 0, takePhotoCanvas.width, takePhotoCanvas.height);
    context.strokeRect(x1, y1, width, height);
}

function cropToSelection(sx, sy, swidth, sheight) {
    const canvasToModelRatio = Math.max(swidth, sheight) / 640;
    shelfCanvas.width = swidth / canvasToModelRatio;
    shelfCanvas.height = sheight / canvasToModelRatio;
    shelfCanvas.style.width = swidth / canvasToModelRatio + "px";
    shelfCanvas.style.height = sheight / canvasToModelRatio + "px";
    shelfCanvas.getContext("2d")?.clearRect(0, 0, shelfCanvas.width, shelfCanvas.height);
    shelfCanvas
        .getContext("2d")!
        .drawImage(
            takePhotoCanvas,
            sx,
            sy,
            swidth,
            sheight,
            0,
            0,
            shelfCanvas.width,
            shelfCanvas.height,
        );
}

async function imageRec() {
    const img = await createImageBitmap(shelfCanvas);
    const configuration = { scoreThreshold: 0.3, iouThreshold: 0.3, maxNumBoxes: 70 };
    const predictions = await inferEngine.infer(workerId, img, configuration);
    img.close();
    // console.table(predictions);
    return predictions;
    // scales longest dimension to 640px
}

function sortBooks(books) {
    let bin = new Bin(
        getComputedStyle(shelfCanvas).width.split("px")[0],
        getComputedStyle(shelfCanvas).height.split("px")[0],
        new heuristics.BottomLeft(),
    );
    let boxes = new Array(books.length);
    for (let i = 0; i < books.length; i++) {
        let box = new Box(books[i].bbox.width, books[i].bbox.height);
        boxes[i] = box;
    }
    // console.log("boxes: " + JSON.stringify(boxes));
    let packer = new Packer([bin]);
    let packedBoxes = packer.pack(boxes);
    // make the sorter respect gravity by flipping the y axis
    for (let box of packedBoxes) {
        box.y =
            (getComputedStyle(shelfCanvas).height.split("px")[0] as unknown as number) -
            box.y -
            box.height;
    }
    // console.table(bin);
    return packedBoxes;
}

function generateBookCanvases(predictions, rectX, rectY, rectWidth, rectHeight) {
    const modelToCanvasRatio = 640 / Math.max(rectWidth, rectHeight);
    // first remove existing canvases
    while (booksDiv.firstChild) booksDiv.removeChild(booksDiv.firstChild);

    // then place books on canvas unsorted
    for (let i = 0; i < predictions.length; i++) {
        const bookCanvas = document.createElement("canvas");
        bookCanvas.className = "bookCanvas";
        bookCanvas.id = "bookCanvas" + i;
        const scaledWidth = predictions[i].bbox.width;
        const scaledHeight = predictions[i].bbox.height;
        // changing x and y position from middle of object to top left and scaling to 640
        const scaledX = predictions[i].bbox.x - predictions[i].bbox.width / 2;
        const scaledY = predictions[i].bbox.y - predictions[i].bbox.height / 2;
        bookCanvas.width = scaledWidth;
        bookCanvas.height = scaledHeight;
        bookCanvas.style.width = scaledWidth + "px";
        bookCanvas.style.height = scaledHeight + "px";
        bookCanvas.style.left = scaledX + "px";
        bookCanvas.style.top = scaledY + "px";
        bookCanvas
            .getContext("2d")
            ?.drawImage(
                takePhotoCanvas,
                +rectX + scaledX / modelToCanvasRatio,
                +rectY + scaledY / modelToCanvasRatio,
                scaledWidth / modelToCanvasRatio,
                scaledHeight / modelToCanvasRatio,
                0,
                0,
                scaledWidth,
                scaledHeight,
            );
        booksDiv.appendChild(bookCanvas);
    }
}

function render() {
    hitting[1] = hitting[0];
    hitting[0] = false;
    frame = renderer.xr.getFrame();
    referenceSpace = renderer.xr.getReferenceSpace();
    if (frame && session && hitTestSourceRequested === false) {
        session
            .requestReferenceSpace("viewer")
            .then(function (referenceSpace) {
                session!
                    .requestHitTestSource({ space: referenceSpace })
                    .then(function (source) {
                        hitTestSource = source;
                    });
            });
        hitTestSourceRequested = true;
    }

    if (hitTestSource != null && !shelfPlaced) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);
        if (hitTestResults.length) {
            const hit = hitTestResults[0];
            if (shelfGroup) {
                shelfGroup.position.set(
                    hit.getPose(referenceSpace!)!.transform.matrix[12],
                    hit.getPose(referenceSpace!)!.transform.matrix[13],
                    hit.getPose(referenceSpace!)!.transform.matrix[14],
                );
                baseShelfPosition.set(
                    hit.getPose(referenceSpace!)!.transform.matrix[12],
                    hit.getPose(referenceSpace!)!.transform.matrix[13],
                    hit.getPose(referenceSpace!)!.transform.matrix[14],
                );
                shelfGroup.quaternion.setFromRotationMatrix(camera.matrixWorld);
                shelfGroup.updateMatrix();
            }
            hitting[0] = true;
        }
        // only run handleStateChangeXR() if hitting status changes
        if (hitting[0] > hitting[1]) handleStateChangeXR("placingShelf");
        else if (hitting[0] < hitting[1]) handleStateChangeXR("placingShelf");
    }
    shelfGroup.position.set(...baseShelfPosition.toArray());
    let zVector = new THREE.Vector3(0, 0, -1).normalize();
    shelfGroup.translateOnAxis(zVector, depthSliderPos / 500);

    renderer.render(scene, camera);
}
