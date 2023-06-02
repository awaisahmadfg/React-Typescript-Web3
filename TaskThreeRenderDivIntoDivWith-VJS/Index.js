// Created a new div element.
const element = document.createElement("div"); 

// Set the text content of the div element to "This is a dynamically rendered element".
element.textContent = "This is a dynamically rendered element"; 

// Find the element with the ID root.
const root = document.getElementById("root")

// Append the div element to the root element.
root.appendChild(element);