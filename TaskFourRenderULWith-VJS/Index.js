// Created a new ul element.
const ul = document.createElement("ul");

// creates a loop that iterates over the list of items ['Item 1', 'Item 2', 'Item 3']
// A new li element is created.
// The text content of the li element is set to the current item in the list 
// The text content of the li element is set to the current item in the list

for (const item of ['Item 1', 'Item 2', 'Item 3']){
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
}

// gets the element with the ID root
const root = document.getElementById("root");

// The ul element is then appended to the root element.
root.appendChild(ul)