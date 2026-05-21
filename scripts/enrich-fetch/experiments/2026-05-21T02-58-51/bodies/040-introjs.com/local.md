### 2 Call the `introJs.tour.start()` method

The `start()` method configures the library and starts the product tour.

```
introJs.tour().setOptions({
  steps: [{
    intro: "Hello world!"
  }, {
    element: document.querySelector('#login'),
    intro: "Click here to login!"
  }]
}).start();
```