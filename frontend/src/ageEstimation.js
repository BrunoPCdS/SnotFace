let faceapi;
let modelsReady;

async function loadModels() {
  if (!faceapi) {
    faceapi = await import('@vladmandic/face-api');
  }

  if (!modelsReady) {
    modelsReady = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.ageGenderNet.loadFromUri('/models'),
    ]).catch((error) => {
      modelsReady = null;
      throw error;
    });
  }
  await modelsReady;
}

export async function estimateAgeLocally(dataUrl) {
  await loadModels();

  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const faces = await faceapi
    .detectAllFaces(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
    .withAgeAndGender();

  if (faces.length === 0) {
    throw new Error('Nao foi possivel encontrar um rosto na imagem. Tente outra foto.');
  }

  const largestFace = faces.reduce((largest, current) => (
    current.detection.box.area > largest.detection.box.area ? current : largest
  ));
  return Math.max(1, Math.min(120, Math.round(largestFace.age)));
}
