Twinkly lights integration for node red as its that time of year again!! 

Supports on/off, brightness & color settings for local lights based on IP address.  I originally made these nodes so i could attach the lights to my overall christmas timers and twinkly lights only have a single timer.  I have since added some color control so my christmas tree turns red when my build pipeline fails :)

<h2>Usage</h2>

Enter the IP address of your twinkly lights in the address field.  On deployment the ON/OFF state of the lights or an error will be shown on the node status.  To control the lights...

- Send ON or OFF in the 'payload' property to set the power state of the lights
- Send a value 0->100 in the 'brightness' property to set the  brightness
- Send a color template in the 'color' property to set the led colors.  3 simple color modes are currently supported.

These nodes  use the twinkly local API so your node red instance must be on the same local network.  Also, as the API is not event based, you can use the twinkly-get node to read or poll the state 7 details of a light as required.

<h2>Color Template</h2>

The color template is a JSON object used to control the LEDs and has the following properties

- <b>mode</b>, color mode to use, either...
  - <i>solid</i> LEDs are alternated along the length of the lights and remain static
  - <i>blink</i> All LEDs are set to the same color and transition through all colors.
  - <i>Loop</i> LEDs are alternated along the length of the lights and animated.
- <b>delay</b>, time between each color change in ms.  If using a larger number of steps, lower this value to change colours more quickly.  Not used in solid mode.
- <b>steps</b>, number of steps between each color change.  Allows for smoother transitions between colours without the need to define each step manually.
- <b>colors</b>, array of colours to use of the form [ R, G, B, W ].  If you only have RGB lights, W will be ignored or it can be ommitted.

The example below animates between red & blue using 10 steps. This results in 20 frames overall animating from red to blue and back to red again with 50ms between each frame.
<pre>
<code>
{
    "mode": "blink",
    "delay": 50,
    "steps": 10,
    "colors": [
        [ 255, 0, 0, 0 ],
        [ 0, 0, 255, 0 ]
    ]
}
</code>
</pre>

You can add as many colors or steps as required but there will be a limit to what the twinkly device can hold in memory which i havent tested yet.

If you like/use this node, coffee makes me happy and it keeps me coding when i should be sleeping...

<a href="https://www.buymeacoffee.com/thingzi" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 50px !important;width: 200px !important;" ></a>
