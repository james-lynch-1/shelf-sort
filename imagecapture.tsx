// const getUserMediaButton = document.createElement("button");
// getUserMediaButton.id = "getUserMediaButton";
// getUserMediaButton.innerHTML = "Get User Media";
// getUserMediaButton.style.height = "100px";
// getUserMediaButton.style.width = "100px";
// document.body.appendChild(getUserMediaButton);
// getUserMediaButton.addEventListener("click", onGetUserMediaButtonClick);

// const takePhotoButton = document.createElement("button");
// takePhotoButton.id = "takePhotoButton";
// takePhotoButton.innerHTML = "Take Photo";
// takePhotoButton.style.height = "100px";
// takePhotoButton.style.width = "100px";
// document.body.appendChild(takePhotoButton);
// takePhotoButton.addEventListener("click", onTakePhotoButtonClick);

let track: MediaStreamTrack;
const width = window.innerWidth.toString();
const height = window.innerHeight.toString();

// document.getElementById("video")!.style.width = width + "px";
// document.getElementById("takePhotoCanvas")!.style.width = "1080px";
// document.getElementById("takePhotoCanvas")!.style.height = "1920px";

let imageCapture: ImageCapture;

function onGetUserMediaButtonClick() {
    navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then((mediaStream) => {
            // document.querySelector("video")!.srcObject = mediaStream;

            track = mediaStream.getVideoTracks()[0];
            imageCapture = new ImageCapture(track);
        })
        .catch((error) => console.log(error));
}

function onTakePhotoButtonClick() {
    imageCapture
        .takePhoto({
            fillLightMode: "off",
            imageHeight: 1920,
            imageWidth: 1080,
            redEyeReduction: false,
        })
        .then((blob) => createImageBitmap(blob))
        .then((imageBitmap) => {
            const canvas = document.querySelector("#takePhotoCanvas");
            drawCanvas(canvas, imageBitmap);
        })
        .catch((error) => console.log(error));
    console.log(imageCapture.getPhotoSettings());
}

export function drawCanvas(canvas, img) {
    canvas.width = getComputedStyle(canvas).width.split("px")[0];
    canvas.height = getComputedStyle(canvas).height.split("px")[0];
    let ratio = Math.min(canvas.width / img.width, canvas.height / img.height);
    let x = canvas.width - img.width * ratio;
    let y = canvas.height - img.height * ratio;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    canvas.getContext("2d").drawImage(img, 0, 0);
    // track.stop();
    // canvas
    //     .getContext("2d")
    //     .drawImage(
    //         img,
    //         0,
    //         0,
    //         img.width,
    //         img.height,
    //         x,
    //         y,
    //         img.width * ratio,
    //         img.height * ratio,
    //     );
}

// document.querySelector("video")!.addEventListener("play", function () {
//     // document.querySelector("#grabFrameButton").disabled = false;
//     document.querySelector("#takePhotoButton").disabled = false;
// });
