const map = L.map('map').setView([36.75, 3.06], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// querySelectorAll selects all HTML elements with the class name and return them in array like so the indecies are to to which one
const locationInput = document.querySelectorAll('.input-box')[0];
const destinationInput = document.querySelectorAll('.input-box')[1];
const locationResults = document.querySelectorAll('.result-list')[0];
const destinationResults = document.querySelectorAll('.result-list')[1];

const destinationsListHTML = document.querySelector(".destination-list");
const selectButton = document.getElementById('select-btn');

let currentLocation = null;
let selectedDestination = null;
let destinationsList = [];

// initialize routing control (will be updated when we have waypoints)
let routingControl = null;

function loadLocalStorage(){
  if(localStorage.getItem("currentLocationStorage")){
    console.log("Current Location is stored");
    console.log(localStorage.getItem("currentLocationStorage"));
    currentLocation = JSON.parse(localStorage.getItem("currentLocationStorage"));
  }
  if(localStorage.getItem("destinationsListStorage")){
    console.log("Destination List is stored");
    console.log(localStorage.getItem("destinationsListStorage"));
    destinationsList = JSON.parse(localStorage.getItem("destinationsListStorage"));
    updateDestinationsList();
  }
  if(currentLocation && destinationsList.length > 0){
    updateRoute();
  }
}

//search functions with debounce
function setupSearch(inputElement, resultsElement, callback) {
  let debounceTimer;
  
  inputElement.onkeyup = function() {
    clearTimeout(debounceTimer);
    const query = inputElement.value.trim();

    if (!query) {
      resultsElement.innerHTML = "";
      return;
    }

    // this so the search list doesn't change everytime the user types a letter
    debounceTimer = setTimeout(() => {searchPlaces(query, resultsElement, callback);}, 300);
  };
}

function searchPlaces(query, resultsElement, callback) {
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
    .then(response => response.json())
    .then(data => {
      const places = data.slice(0, 5);
      displaySearchResult(places, resultsElement, callback);
    })
    .catch(err => {
      console.error("Error fetching places:", err);
    });
}

function displaySearchResult(places, resultsElement, callback) {
  const content = places.map(place => {
    // Escape quotes in display name to prevent JS injection
    const displayName = place.display_name.replace(/"/g, '&quot;').replace(/'/g, "\\'");
    const lat = place.lat;
    const lon = place.lon;
    return `<li onclick="${callback}('${displayName}', ${lat}, ${lon})">${displayName}</li>`;
  });
  resultsElement.innerHTML = content.join('');
}

// Setup both search inputs
setupSearch(locationInput, locationResults, 'selectLocation');
setupSearch(destinationInput, destinationResults, 'selectDestination');

function selectLocation(name, lat, lon) {
  locationInput.value = name;
  locationResults.innerHTML = "";
  currentLocation = { name, coor: [parseFloat(lat), parseFloat(lon)] };
}

function selectDestination(name, lat, lon) {
  destinationInput.value = name;
  destinationResults.innerHTML = "";
  selectedDestination = { name, coor: [parseFloat(lat), parseFloat(lon)] };
}

function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(successGettingLocation, errorGettingLocation);
  } 
  else {
    alert("Geolocation is not supported by this browser.");
  }
}

function setLocation(){
  if (!currentLocation){
    alert("Please select a location from the dropdown first");
    return;
  }
  updateMapView(currentLocation.coor, "Your current location");
  updateRoute();
}

function successGettingLocation(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  
  // Reverse geocode to get location name
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
    .then(response => response.json())
    .then(data => {
      const displayName = data.display_name;
      locationInput.value = displayName;
      currentLocation = { name: displayName, coor: [lat, lon] };
      updateMapView([lat, lon], "Your current location");
      updateRoute();
    })
    .catch(err => {
      console.error("Error getting location name:", err);
      // Still set the location even if we can't get the name
      currentLocation = { name: "Your Location", coor: [lat, lon] };
      updateMapView([lat, lon], "Your current location");
    });
}

function errorGettingLocation() {
  alert("No position available");
}

// Destination functions
function setViewSelected() {
  if (!selectedDestination) {
    alert("Please select a destination first");
    return;
  }

  updateMapView(selectedDestination.coor, selectedDestination.name);
  
  destinationsList.push({
    name: selectedDestination.name,
    coor: selectedDestination.coor
  });

  updateDestinationsList();
  updateRoute();
  
  // Clear the destination input
  destinationInput.value = "";
  selectedDestination = null;
}

function updateMapView(coords, popupText) {
  map.setView(coords, 13);
  
  // Clear existing markers
  map.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer);
    }
  });
  
  L.marker(coords)
    .addTo(map)
    .bindPopup(popupText)
    .openPopup();
}

function updateDestinationsList() {
  destinationsListHTML.innerHTML = "";

  destinationsList.forEach((destination, index) => {
    const listItem = document.createElement('li');
    listItem.className = 'destinationListItem';
    
    listItem.innerHTML = `
      <div class='control-btns'>
        <button onclick='changeOrder(${index}, -1)'>
          <i class="fa-solid fa-arrow-up"></i>
        </button>
        <button onclick='changeOrder(${index}, 1)'>
          <i class="fa-solid fa-arrow-down"></i>
        </button>
      </div>
      <p>${destination.name}</p>
      <button onclick='removeDestination(${index})'>
        Remove
      </button>
    `; 
    destinationsListHTML.appendChild(listItem);
  });
}

function removeDestination(index) {
  destinationsList.splice(index, 1);
  updateDestinationsList();
  updateRoute();
}

function changeOrder(index, direction) {
  const newIndex = index + direction;
  if (newIndex >= 0 && newIndex < destinationsList.length) {
    [destinationsList[index], destinationsList[newIndex]] = [destinationsList[newIndex], destinationsList[index]];
    updateDestinationsList();
    updateRoute();
  }
}

function updateRoute() {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }

  if (!currentLocation || destinationsList.length === 0) return;

  const waypoints = [
    L.latLng(currentLocation.coor[0], currentLocation.coor[1]),
    ...destinationsList.map(dest => L.latLng(dest.coor[0], dest.coor[1]))
  ];

  // using OSRM as the default routing service
  routingControl = L.Routing.control({
    waypoints: waypoints,
    router: L.Routing.osrmv1({
      serviceUrl: "https://router.project-osrm.org/route/v1"
    }),
    lineOptions: {
      styles: [{ color: '#0066ff', weight: 5, opacity: 0.7 }]
    },
    show: false,
    addWaypoints: false,
    routeWhileDragging: false,
    fitSelectedRoutes: true
  }).addTo(map);
  
  //update current location on the ui
  document.querySelector(".currentLocationSpan").innerHTML = currentLocation.name;
  storeData(); //store on local storage everytime the data changes

  // for debugging
  routingControl.on('routesfound', function(e) {
    console.log("Route found:", e.routes);
  });

  routingControl.on('routingerror', function(e) {
    console.error("Routing error:", e.error);
    alert("Could not calculate route. Please check your locations.");
  });
}

function changeSideBar(){
  let sideBar = document.querySelector(".destinations");
  let barButton = document.querySelector(".fixed-button");
  if (sideBar.classList.contains("open")){
    sideBar.classList.remove("open");
    sideBar.classList.add("close");
    barButton.innerHTML = '<i class="fa-regular fa-square-caret-right"></i>';
  }
  else if(sideBar.classList.contains("close")){
    sideBar.classList.remove("close");
    sideBar.classList.add("open");
    barButton.innerHTML = '<i class="fa-regular fa-square-caret-left"></i>';
  }
}

//event listener for the select button
selectButton.addEventListener('click', setLocation);

function storeData(){
  localStorage.setItem('currentLocationStorage', JSON.stringify(currentLocation));
  localStorage.setItem('destinationsListStorage', JSON.stringify(destinationsList));
}

